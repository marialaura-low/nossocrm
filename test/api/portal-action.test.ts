/**
 * Testes para POST /api/portal-action.
 *
 * Escreve uma ação de funil (resultado de contato ou override manual) direto
 * no portal dos representantes via edge function `funil-update` (admin-only,
 * token no header) e dispara um re-sync imediato do espelho Maré/CRM
 * (`sync-funil-portal`) para o board refletir a mudança na hora.
 *
 * Estratégia de mock: vi.mock para createClient (Supabase) + vi.stubGlobal
 * para fetch (chamadas às duas edge functions).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Constantes de teste
// ---------------------------------------------------------------------------
// UUIDs v4 válidos (versão 4, variante 8 na posição 19)
const USER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5'
const DEAL_ID = 'c3d4e5f6-a7b8-4c9d-8e0f-a1b2c3d4e5f6'
const NEGOCIO_ID = 42

const PORTAL_URL = 'https://portal.test/functions/v1/funil-update'
const SYNC_URL = 'https://crm.test/functions/v1/sync-funil-portal'
const PORTAL_TOKEN = 'test-portal-token'
const SYNC_SECRET = 'test-sync-secret'

const PORTAL_SUCCESS_BODY = { ok: true, efeito: 'retry:+5d' }

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
let dealQueryBuilder: Record<string, unknown>
let authMock: Record<string, unknown>
let supabaseClientMock: Record<string, unknown>

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseClientMock),
}))

// ---------------------------------------------------------------------------
// Imports (após mocks)
// ---------------------------------------------------------------------------
import { POST } from '@/app/api/portal-action/route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildDealQB(customFields: Record<string, unknown> | null = { portal_negocio_id: NEGOCIO_ID }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({
      data: customFields === null ? null : { id: DEAL_ID, custom_fields: customFields },
      error: null,
    })),
  }
}

function buildAuthMock(userId: string | null = USER_ID) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
        error: userId ? null : { message: 'not authenticated' },
      })),
    },
  }
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/portal-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function parseFetchBody(call: unknown[]): Record<string, unknown> {
  const init = call[1] as RequestInit
  return JSON.parse(init.body as string)
}

// Estado mutável da resposta simulada do edge do portal (cada teste ajusta se precisar)
let portalStatus: number
let portalBody: unknown
let fetchMock: ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------
describe('POST /api/portal-action', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    process.env.PORTAL_FUNIL_URL = PORTAL_URL
    process.env.PORTAL_FUNIL_TOKEN = PORTAL_TOKEN
    process.env.CRM_SYNC_URL = SYNC_URL
    process.env.CRM_SYNC_SECRET = SYNC_SECRET

    dealQueryBuilder = buildDealQB()
    authMock = buildAuthMock()
    supabaseClientMock = {
      ...authMock,
      from: vi.fn((table: string) => {
        if (table === 'deals') return dealQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    portalStatus = 200
    portalBody = PORTAL_SUCCESS_BODY

    fetchMock = vi.fn(async (url: string) => {
      if (url === SYNC_URL) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response
      }
      return {
        ok: portalStatus >= 200 && portalStatus < 300,
        status: portalStatus,
        json: async () => portalBody,
      } as Response
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ── Autenticação ──────────────────────────────────────────────────────────

  it('retorna 401 quando usuário não autenticado', async () => {
    // Arrange
    supabaseClientMock = {
      ...buildAuthMock(null),
      from: vi.fn(),
    }

    // Act
    const res = await POST(makeRequest({ dealId: DEAL_ID, resultado: 'falei_ok' }))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(401)
    expect(body.error).toBe('não autenticado')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // ── Validação ─────────────────────────────────────────────────────────────

  it('retorna 400 quando resultado é inválido', async () => {
    // Act
    const res = await POST(makeRequest({ dealId: DEAL_ID, resultado: 'xpto' }))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.error).toBe('resultado inválido')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retorna 400 quando resultado=perdido sem motivo_slug', async () => {
    // Act
    const res = await POST(makeRequest({ dealId: DEAL_ID, resultado: 'perdido' }))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.error).toBe('perdido exige motivo_slug')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retorna 400 quando deal não é espelho do portal (sem custom_fields.portal_negocio_id)', async () => {
    // Arrange
    dealQueryBuilder = buildDealQB(null)
    supabaseClientMock = {
      ...authMock,
      from: vi.fn((table: string) => {
        if (table === 'deals') return dealQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    // Act
    const res = await POST(makeRequest({ dealId: DEAL_ID, resultado: 'falei_ok' }))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.error).toBe('deal não é espelho do portal')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // ── Happy path ────────────────────────────────────────────────────────────

  it('chama o edge do portal com o token no header e dispara o re-sync (happy path)', async () => {
    // Act
    const res = await POST(
      makeRequest({ dealId: DEAL_ID, resultado: 'falei_ok', obs: 'ligou, vai decidir semana que vem', nota: 5 })
    )
    const body = await res.json()

    // Assert — resposta é o corpo do edge do portal
    expect(res.status).toBe(200)
    expect(body).toEqual(PORTAL_SUCCESS_BODY)

    // Chamada ao portal: token no HEADER (nunca na URL), payload no contrato esperado
    expect(fetchMock).toHaveBeenCalledWith(
      PORTAL_URL,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-portal-token': PORTAL_TOKEN }),
      })
    )
    const portalCall = fetchMock.mock.calls.find((c) => c[0] === PORTAL_URL)!
    expect(parseFetchBody(portalCall)).toEqual({
      negocio_id: NEGOCIO_ID,
      resultado: 'falei_ok',
      obs: 'ligou, vai decidir semana que vem',
      nota: 5,
    })

    // Re-sync imediato disparado com o secret no header
    expect(fetchMock).toHaveBeenCalledWith(
      SYNC_URL,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-sync-secret': SYNC_SECRET }),
      })
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('override bypassa a validação de resultado e envia o payload de override', async () => {
    // Act
    const res = await POST(
      makeRequest({
        dealId: DEAL_ID,
        override: { para_etapa_slug: 'perdido', motivo: 'ajuste manual' },
      })
    )
    const body = await res.json()

    // Assert
    expect(res.status).toBe(200)
    expect(body).toEqual(PORTAL_SUCCESS_BODY)

    const portalCall = fetchMock.mock.calls.find((c) => c[0] === PORTAL_URL)!
    expect(parseFetchBody(portalCall)).toEqual({
      override: { negocio_id: NEGOCIO_ID, para_etapa_slug: 'perdido', motivo: 'ajuste manual' },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  // ── Propagação de erro do edge ────────────────────────────────────────────

  it('propaga status e corpo quando o edge do portal retorna 409', async () => {
    // Arrange
    portalStatus = 409
    portalBody = { ok: false, error: 'negócio já fechado' }

    // Act
    const res = await POST(makeRequest({ dealId: DEAL_ID, resultado: 'falei_ok' }))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(409)
    expect(body).toEqual({ ok: false, error: 'negócio já fechado' })
    // Falhou no portal: não deve disparar o re-sync
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // ── Resiliência do re-sync ────────────────────────────────────────────────

  it('não derruba a resposta quando o re-sync imediato falha (cron diário reconcilia)', async () => {
    // Arrange — portal responde ok, mas a chamada de re-sync lança exceção (rede fora)
    fetchMock.mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      json: async () => portalBody,
    } as Response))
    fetchMock.mockImplementationOnce(async () => {
      throw new Error('network down')
    })

    // Act
    const res = await POST(makeRequest({ dealId: DEAL_ID, resultado: 'falei_ok' }))
    const body = await res.json()

    // Assert — ainda retorna o sucesso do portal
    expect(res.status).toBe(200)
    expect(body).toEqual(PORTAL_SUCCESS_BODY)
  })
})

/**
 * Testes para GET /api/portal-metricas — fundação do dashboard-fusão.
 * Puxa métricas do miolo do portal (Supabase Macboot) via PostgREST anon.
 * Mock: createClient (auth) + fetch (chamadas ao portal).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let supabaseClientMock: Record<string, unknown>
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseClientMock),
}))

import { GET } from '@/app/api/portal-metricas/route'

const authOk = { auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) } }

describe('GET /api/portal-metricas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.PORTAL_REST_URL = 'https://portal.test/rest/v1'
    process.env.PORTAL_ANON_KEY = 'anon-key'
    supabaseClientMock = authOk
  })
  afterEach(() => vi.unstubAllGlobals())

  it('retorna 401 quando não autenticado', async () => {
    supabaseClientMock = { auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) } }
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('retorna recompra_segmento do funil_baseline (a métrica de ouro)', async () => {
    const baseline = [
      { segmento: 'ecommerce_marketplace', janela: 'recompra_120d', pct: 79.1, n: 153 },
      { segmento: 'rede', janela: 'recompra_120d', pct: 56.0, n: 425 },
      { segmento: 'loja_independente', janela: 'recompra_120d', pct: 19.7, n: 1094 },
      { segmento: 'TOTAL', janela: 'recompra_120d', pct: 35.0, n: 1705 },
    ]
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => baseline }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.recompra_segmento).toEqual(baseline)
    // chamou o portal (funil_baseline) com a anon key no header
    const call = fetchMock.mock.calls[0]
    expect(String(call[0])).toContain('/funil_baseline')
    expect((call[1] as RequestInit).headers).toMatchObject({ apikey: 'anon-key' })
  })
})

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

const baseline = [
  { segmento: 'ecommerce_marketplace', janela: 'recompra_120d', pct: 79.1, n: 153 },
  { segmento: 'rede', janela: 'recompra_120d', pct: 56.0, n: 425 },
  { segmento: 'loja_independente', janela: 'recompra_120d', pct: 19.7, n: 1094 },
  { segmento: 'TOTAL', janela: 'recompra_120d', pct: 35.0, n: 1705 },
]

const fechamento = [
  { canal: 'B2B', pares_emitidos: 14807, valor_emitido: 2942727.63, pares_entregues: 14441, valor_entregue: 2720254.64 },
  { canal: 'E-commerce (fabrica)', pares_emitidos: 2086, valor_emitido: 439832.92, pares_entregues: 0, valor_entregue: 0 },
  { canal: 'Exportacao', pares_emitidos: 516, valor_emitido: 18162.36, pares_entregues: 0, valor_entregue: 0 },
]

const positivacao = [
  { pilar: 'retencao', clientes: 40, pares: 12035 },
  { pilar: 'novo', clientes: 19, pares: 995 },
  { pilar: 'reativacao', clientes: 55, pares: 4043 },
]

/** roteia o fetch mockado por URL: funil_baseline (GET) x RPCs (POST). */
function stubPortalFetch(over: { baseline?: unknown; fechamento?: unknown; positivacao?: unknown; baselineOk?: boolean; fechamentoOk?: boolean; positivacaoOk?: boolean } = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('/rpc/fechamento_comercial')) {
      return { ok: over.fechamentoOk ?? true, status: 200, json: async () => over.fechamento ?? fechamento }
    }
    if (String(url).includes('/rpc/positivacao_mensal')) {
      return { ok: over.positivacaoOk ?? true, status: 200, json: async () => over.positivacao ?? positivacao }
    }
    return { ok: over.baselineOk ?? true, status: 200, json: async () => over.baseline ?? baseline }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function req(qs = '') {
  return new Request(`http://localhost/api/portal-metricas${qs}`)
}

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
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('retorna recompra_segmento do funil_baseline (a métrica de ouro)', async () => {
    const fetchMock = stubPortalFetch()
    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.recompra_segmento).toEqual(baseline)
    // chamou o portal (funil_baseline) com a anon key no header
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/funil_baseline'))!
    expect((call[1] as RequestInit).headers).toMatchObject({ apikey: 'anon-key' })
  })

  it('retorna receita (emissão × entrega) por canal + total, da RPC canônica fechamento_comercial', async () => {
    const fetchMock = stubPortalFetch()
    const res = await GET(req('?inicio=2026-06-01&fim=2026-07-01'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.receita.periodo).toEqual({ inicio: '2026-06-01', fim: '2026-07-01' })
    expect(body.receita.canais).toEqual(fechamento)
    // total é a SOMA dos canais — emissão (sell_in) e entrega (faturamento) separadas
    expect(body.receita.total).toEqual({
      pares_emitidos: 17409,
      valor_emitido: 3400722.91,
      pares_entregues: 14441,
      valor_entregue: 2720254.64,
    })
    // chamou a RPC via POST passando o período no corpo
    const rpc = fetchMock.mock.calls.find((c) => String(c[0]).includes('/rpc/fechamento_comercial'))!
    expect((rpc[1] as RequestInit).method).toBe('POST')
    expect(JSON.parse((rpc[1] as RequestInit).body as string)).toEqual({ inicio: '2026-06-01', fim: '2026-07-01' })
  })

  it('retorna positivação em 3 pilares + total, da RPC canônica positivacao_mensal', async () => {
    const fetchMock = stubPortalFetch()
    const res = await GET(req('?inicio=2026-06-01&fim=2026-07-01'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.positivacao.pilares).toEqual(positivacao)
    // total = soma dos pilares (positivados do mês)
    expect(body.positivacao.total).toEqual({ clientes: 114, pares: 17073 })
    expect(body.positivacao.escritorio).toBeNull()
  })

  it('micro→macro: passa o escritório adiante pra RPC de positivação (carteira do rep)', async () => {
    const fetchMock = stubPortalFetch()
    const res = await GET(req('?escritorio=B2B%20SIM'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.positivacao.escritorio).toBe('B2B SIM')
    const rpc = fetchMock.mock.calls.find((c) => String(c[0]).includes('/rpc/positivacao_mensal'))!
    expect(JSON.parse((rpc[1] as RequestInit).body as string)).toMatchObject({ p_escritorio: 'B2B SIM' })
  })

  it('resiliência: se a receita falhar, ainda entrega a recompra (não zera o dashboard)', async () => {
    stubPortalFetch({ fechamentoOk: false })
    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.recompra_segmento).toEqual(baseline)
    expect(body.receita).toBeNull()
  })
})

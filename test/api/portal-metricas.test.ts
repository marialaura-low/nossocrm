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

/** query builder mockado do supabase (thenable, encadeia .select/.eq/.is). */
function metasQuery(rows: unknown[]) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is']) q[m] = () => q
  q.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null })
  return q
}

const curvaB2B = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, meta: [13431, 6100, 12400, 17000, 17000, 17000, 19000, 12000, 14000, 18000, 15000, 10000][i] }))

function supaMock(metas: unknown[] = [{ indicador: 'novos', meta_ano: 308 }], mensais: unknown[] = curvaB2B) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) },
    from: vi.fn((table: string) => metasQuery(table === 'metas_mensais' ? mensais : metas)),
  }
}

const authOk = supaMock()

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
  { pilar: 'retencao', clientes: 42, pares: 12133 },
  { pilar: 'novo', clientes: 19, pares: 995 },
  { pilar: 'reativacao', clientes: 60, pares: 4281 },
]

const intensidade = [
  { valor: 3400722.91, pares: 17409, pedidos: 253, clientes: 121, arpu: 28105.15, ticket_medio: 13441.59, frequencia: 2.09 },
]

const aquisicao = [
  { mes: '2026-05-01', novos: 21, pares: 1167 },
  { mes: '2026-06-01', novos: 19, pares: 995 },
  { mes: '2026-07-01', novos: 7, pares: 290 },
]

const emissaoB2B = [
  { mes: '2026-01-01', pares: 12540, valor: 2392823.34 },
  { mes: '2026-02-01', pares: 16339, valor: 3232077.87 },
  { mes: '2026-03-01', pares: 15181, valor: 2879275.29 },
  { mes: '2026-04-01', pares: 7295, valor: 1397792.45 },
  { mes: '2026-05-01', pares: 11438, valor: 2161923.16 },
  { mes: '2026-06-01', pares: 14471, valor: 2872517.60 },
  { mes: '2026-07-01', pares: 3398, valor: 679481.72 },
]

const conversaoFunil = [{ ganhos: 15, fechados: 263, pct: 5.7 }]

const ltvReceita = [{ ltv: 49433.77, clientes: 1906, desde: '2023-01-01' }]

const churnClientes = [{ clientes: 81, valor_12m: 2350595.6 }]

const carteiraPositivada = [{ positivados: 48, carteira: 752, pct: 6.4 }]

/** roteia o fetch mockado por URL: funil_baseline (GET) x RPCs (POST). */
function stubPortalFetch(over: { baseline?: unknown; fechamento?: unknown; positivacao?: unknown; intensidade?: unknown; aquisicao?: unknown; emissao?: unknown; conversao?: unknown; ltv?: unknown; churn?: unknown; carteira?: unknown; baselineOk?: boolean; fechamentoOk?: boolean; positivacaoOk?: boolean; intensidadeOk?: boolean; aquisicaoOk?: boolean; emissaoOk?: boolean } = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('/rpc/fechamento_comercial')) {
      return { ok: over.fechamentoOk ?? true, status: 200, json: async () => over.fechamento ?? fechamento }
    }
    if (String(url).includes('/rpc/positivacao_mensal')) {
      return { ok: over.positivacaoOk ?? true, status: 200, json: async () => over.positivacao ?? positivacao }
    }
    if (String(url).includes('/rpc/intensidade_compra_mensal')) {
      return { ok: over.intensidadeOk ?? true, status: 200, json: async () => over.intensidade ?? intensidade }
    }
    if (String(url).includes('/rpc/aquisicao_mensal')) {
      return { ok: over.aquisicaoOk ?? true, status: 200, json: async () => over.aquisicao ?? aquisicao }
    }
    if (String(url).includes('/rpc/emissao_mensal_b2b')) {
      return { ok: over.emissaoOk ?? true, status: 200, json: async () => over.emissao ?? emissaoB2B }
    }
    if (String(url).includes('/rpc/conversao_funil')) {
      return { ok: true, status: 200, json: async () => over.conversao ?? conversaoFunil }
    }
    if (String(url).includes('/rpc/ltv_receita')) {
      return { ok: true, status: 200, json: async () => over.ltv ?? ltvReceita }
    }
    if (String(url).includes('/rpc/churn_clientes')) {
      return { ok: true, status: 200, json: async () => over.churn ?? churnClientes }
    }
    if (String(url).includes('/rpc/carteira_positivada')) {
      return { ok: true, status: 200, json: async () => over.carteira ?? carteiraPositivada }
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
    // total = soma dos pilares (positivados do mês) — reconcilia com a receita (121 / 17.409)
    expect(body.positivacao.total).toEqual({ clientes: 121, pares: 17409 })
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

  it('retorna intensidade (ARPU/ticket/frequência) da RPC intensidade_compra_mensal — 1 linha achatada', async () => {
    const fetchMock = stubPortalFetch()
    const res = await GET(req('?inicio=2026-06-01&fim=2026-07-01&escritorio=B2B%20SIM'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.intensidade).toMatchObject({
      arpu: 28105.15, ticket_medio: 13441.59, frequencia: 2.09, clientes: 121, escritorio: 'B2B SIM',
    })
    // valor reconcilia com a receita (mesma base) — sanity de que não inventou número
    expect(body.intensidade.valor).toBe(3400722.91)
    const rpc = fetchMock.mock.calls.find((c) => String(c[0]).includes('/rpc/intensidade_compra_mensal'))!
    expect(JSON.parse((rpc[1] as RequestInit).body as string)).toMatchObject({ p_escritorio: 'B2B SIM' })
  })

  it('retorna aquisição: série de novos/mês + YTD + mês atual, da RPC aquisicao_mensal', async () => {
    const fetchMock = stubPortalFetch()
    const res = await GET(req('?escritorio=B2B%20SIM'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.aquisicao.serie).toEqual(aquisicao)
    expect(body.aquisicao.ytd).toEqual({ novos: 47, pares: 2452 }) // soma da série
    expect(body.aquisicao.atual).toEqual({ mes: '2026-07-01', novos: 7, pares: 290 }) // último mês
    expect(body.aquisicao.escritorio).toBe('B2B SIM')
    const rpc = fetchMock.mock.calls.find((c) => String(c[0]).includes('/rpc/aquisicao_mensal'))!
    expect(JSON.parse((rpc[1] as RequestInit).body as string)).toMatchObject({ p_escritorio: 'B2B SIM' })
  })

  it('anexa a meta de novos (da tabela metas do Maré) na aquisição', async () => {
    stubPortalFetch()
    supabaseClientMock = supaMock([{ indicador: 'novos', meta_ano: 308 }])
    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.aquisicao.meta_novos).toBe(308)
  })

  it('meta_novos vem null quando não há meta cadastrada (sem fabricar número)', async () => {
    stubPortalFetch()
    supabaseClientMock = supaMock([]) // nenhuma meta
    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.aquisicao.meta_novos).toBeNull()
  })

  it('monta o forecast B2B: curva de meta (12m) + realizado + projeção do ano', async () => {
    stubPortalFetch()
    supabaseClientMock = supaMock() // curva default
    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.forecast.meta_ano).toBe(170931) // soma da curva
    expect(body.forecast.serie).toHaveLength(12)
    // janeiro está sempre fechado → realizado real (independente do mês de hoje)
    expect(body.forecast.serie[0]).toEqual({ mes: 1, meta: 13431, realizado: 12540 })
    expect(typeof body.forecast.projecao_ano).toBe('number')
    expect(body.forecast.atingimento_fechado).toBeGreaterThan(0)
  })

  it('expõe conversão do funil e LTV-receita com dado do portal', async () => {
    stubPortalFetch()
    supabaseClientMock = supaMock()
    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.conversao).toMatchObject({ ganhos: 15, fechados: 263, pct: 5.7 })
    expect(body.ltv).toMatchObject({ ltv: 49433.77, clientes: 1906, desde: '2023-01-01' })
  })

  it('expõe churn (quem cruzou 120d no período) com o sell-in 12m em risco', async () => {
    stubPortalFetch()
    supabaseClientMock = supaMock()
    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.churn).toMatchObject({ clientes: 81, valor_12m: 2350595.6 })
    expect(body.churn.periodo).toEqual({ inicio: expect.any(String), fim: expect.any(String) })
  })

  it('positivação ganha a régua da carteira (% positivada sobre a carteira ativa 12m)', async () => {
    stubPortalFetch()
    supabaseClientMock = supaMock()
    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.positivacao.carteira).toEqual({ positivados: 48, carteira: 752, pct: 6.4 })
  })

  it('com ?escritorio: receita usa a função por escritório + propaga p_escritorio nas RPCs que recortam', async () => {
    const fetchMock = stubPortalFetch()
    supabaseClientMock = supaMock()
    await GET(req('?escritorio=' + encodeURIComponent('REP GO REPRESENTACAO COMERCIAL LTDA')))

    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('/rpc/fechamento_comercial_escritorio'))).toBe(true)
    // churn (que recorta) recebeu o escritório no corpo
    const churn = fetchMock.mock.calls.find((c) => String(c[0]).includes('/rpc/churn_clientes'))
    expect(JSON.parse((churn![1] as RequestInit).body as string)).toMatchObject({ p_escritorio: 'REP GO REPRESENTACAO COMERCIAL LTDA' })
  })

  it('sem escritorio: receita usa a canônica fechamento_comercial (macro, fonte única dos outros agentes)', async () => {
    const fetchMock = stubPortalFetch()
    supabaseClientMock = supaMock()
    await GET(req())

    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.endsWith('/rpc/fechamento_comercial'))).toBe(true)
    expect(urls.some((u) => u.includes('fechamento_comercial_escritorio'))).toBe(false)
  })

  it('forecast traz o esforço restante (o que os meses em jogo precisam rodar vs o plano)', async () => {
    stubPortalFetch()
    supabaseClientMock = supaMock()
    const res = await GET(req())
    const body = await res.json()

    // meta_restante = plano do mês corrente até dez; esforço = (meta_ano − fechado) / meta_restante
    expect(body.forecast.meta_restante).toBeGreaterThan(0)
    const esperado = (body.forecast.meta_ano - body.forecast.realizado_fechado) / body.forecast.meta_restante
    expect(body.forecast.esforco_restante).toBeCloseTo(esperado, 2)
    // sem super meta cadastrada → null (não fabrica alvo)
    expect(body.forecast.super_meta).toBeNull()
  })

  it('super meta editável entra no forecast quando cadastrada (alvo esticado, com esforço próprio)', async () => {
    stubPortalFetch()
    supabaseClientMock = supaMock([
      { indicador: 'novos', meta_ano: 308 },
      { indicador: 'super_pares_b2b', meta_ano: 180000, obs: 'em validação — recompensa em desenho' },
    ])
    const res = await GET(req())
    const body = await res.json()

    expect(body.forecast.super_meta).toBe(180000)
    const esperado = (180000 - body.forecast.realizado_fechado) / body.forecast.meta_restante
    expect(body.forecast.esforco_super).toBeCloseTo(esperado, 2)
    // status vive no banco (validar = limpar obs, sem deploy)
    expect(body.forecast.super_meta_obs).toBe('em validação — recompensa em desenho')
  })

  it('super meta sem obs → super_meta_obs null (validada, sem rótulo)', async () => {
    stubPortalFetch()
    supabaseClientMock = supaMock([{ indicador: 'super_pares_b2b', meta_ano: 180000 }])
    const res = await GET(req())
    const body = await res.json()
    expect(body.forecast.super_meta_obs).toBeNull()
  })

  it('forecast vem null quando não há curva de meta cadastrada', async () => {
    stubPortalFetch()
    supabaseClientMock = supaMock([{ indicador: 'novos', meta_ano: 308 }], []) // sem curva mensal
    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.forecast).toBeNull()
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

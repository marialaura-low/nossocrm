/**
 * Testes para GET /api/portal-ficha — ficha rica do Maré (item A da união).
 * O Maré (gestão) lê o MIOLO do portal via edge portal-cliente v13 (caminho admin):
 * token do rep admin no header + escritório EXPLÍCITO na query.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let supabaseClientMock: Record<string, unknown>
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseClientMock),
}))

import { GET } from '@/app/api/portal-ficha/route'

const authOk = { auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) } }

const fichaPortal = {
  matriz: 'AUTOFORTE VEICULOS LTDA',
  ritmo: { n_pedidos: 43, pares_12m: 260 },
  historico: [
    { pedido: '47055', data: '2026-02-05', pares: 26, loja: { cnpj: '31264770000337', fantasia: 'TOYOTA BARIGUI GUARAPUAVA' } },
  ],
  segmento: { modelo_negocio: 'empresa_uso_proprio', nicho: 'outro', segmento_confirmado: true },
}

function req(qs = '') {
  return new Request(`http://localhost/api/portal-ficha${qs}`)
}

describe('GET /api/portal-ficha', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.PORTAL_REST_URL = 'https://portal.test/rest/v1'
    process.env.PORTAL_FUNIL_TOKEN = 'token-admin'
    supabaseClientMock = authOk
  })
  afterEach(() => vi.unstubAllGlobals())

  it('401 quando não autenticado no Maré', async () => {
    supabaseClientMock = { auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) } }
    const res = await GET(req('?matriz=X&escritorio=Y'))
    expect(res.status).toBe(401)
  })

  it('400 sem matriz ou escritório (a edge exige ambos no caminho admin)', async () => {
    const r1 = await GET(req('?matriz=X'))
    const r2 = await GET(req('?escritorio=Y'))
    expect(r1.status).toBe(400)
    expect(r2.status).toBe(400)
  })

  it('chama a edge com token admin no header + matriz/escritório na query e repassa a ficha', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => fichaPortal }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await GET(req('?matriz=' + encodeURIComponent('AUTOFORTE VEICULOS LTDA') + '&escritorio=' + encodeURIComponent('GREEN SHOES REPRESENTACAO COMERCIAL LTDA')))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ritmo.n_pedidos).toBe(43)
    expect(body.historico[0].loja.fantasia).toBe('TOYOTA BARIGUI GUARAPUAVA')

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/functions/v1/portal-cliente')
    expect(String(url)).toContain('cnpj=AUTOFORTE+VEICULOS+LTDA')
    expect(String(url)).toContain('escritorio=GREEN+SHOES')
    expect((init as RequestInit).headers).toMatchObject({ 'x-portal-token': 'token-admin' })
    // token NUNCA na URL (fica em log de gateway)
    expect(String(url)).not.toContain('token-admin')
  })

  it('502 quando a edge falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    const res = await GET(req('?matriz=X&escritorio=Y'))
    expect(res.status).toBe(502)
  })
})

/**
 * Testes para GET /api/portal-escritorios — lista de escritórios pro seletor de decupação.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let supabaseClientMock: Record<string, unknown>
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseClientMock),
}))

import { GET } from '@/app/api/portal-escritorios/route'

const authOk = { auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) } }

describe('GET /api/portal-escritorios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.PORTAL_REST_URL = 'https://portal.test/rest/v1'
    process.env.PORTAL_ANON_KEY = 'anon-key'
    supabaseClientMock = authOk
  })
  afterEach(() => vi.unstubAllGlobals())

  it('401 quando não autenticado', async () => {
    supabaseClientMock = { auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) } }
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('retorna a lista de escritórios do portal (RPC escritorios_comerciais)', async () => {
    const lista = [
      { escritorio: 'ANDERSON PEREIRA SILVA ME', pares_12m: 34619, clientes: 50 },
      { escritorio: 'B2B SIM', pares_12m: 23238, clientes: 111 },
    ]
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => lista }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.escritorios).toEqual(lista)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/rpc/escritorios_comerciais')
  })

  it('502 quando o portal falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    const res = await GET()
    expect(res.status).toBe(502)
  })
})

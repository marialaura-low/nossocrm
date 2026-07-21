// test/inbound/conflito.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkConflito } from '@/lib/inbound/conflito';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubEnv('PORTAL_REST_URL', 'https://cvqczrciitcteabvonmw.supabase.co/rest/v1');
  vi.stubEnv('PORTAL_FUNIL_TOKEN', 'tok');
});

describe('checkConflito', () => {
  it('jaCliente=true quando a edge devolve pedidos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ escritorio: 'REP GO', pedidos: [{ data: '2026-05-10', pares: 60 }] }),
    }));
    const r = await checkConflito('12345678000199');
    expect(r.jaCliente).toBe(true);
    expect(r.escritorio).toBe('REP GO');
    expect(r.ultimoPedido).toBe('2026-05-10');
  });

  it('jaCliente=false quando a edge não acha o cliente (404/vazio)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    const r = await checkConflito('99999999000199');
    expect(r.jaCliente).toBe(false);
    expect(r.escritorio).toBeNull();
  });
});

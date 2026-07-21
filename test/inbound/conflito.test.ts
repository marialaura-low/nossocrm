// test/inbound/conflito.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const portalGetMock = vi.fn();
vi.mock('@/lib/portal/rest', () => ({ portalGet: (...a: unknown[]) => portalGetMock(...a) }));

import { checkConflito } from '@/lib/inbound/conflito';

beforeEach(() => { portalGetMock.mockReset(); });

describe('checkConflito', () => {
  it('jaCliente=true quando o faturamento tem NF pro CNPJ (e normaliza o cnpj)', async () => {
    portalGetMock.mockResolvedValue([{ escritorio: 'REP GO', data_nf: '2026-05-10' }]);
    const r = await checkConflito('12.345.678/0001-99');
    expect(r.jaCliente).toBe(true);
    expect(r.escritorio).toBe('REP GO');
    expect(r.ultimoPedido).toBe('2026-05-10');
    expect(portalGetMock).toHaveBeenCalledWith(expect.stringContaining('/faturamento?cnpj=eq.12345678000199'));
  });

  it('jaCliente=false quando não há NF (array vazio)', async () => {
    portalGetMock.mockResolvedValue([]);
    const r = await checkConflito('99999999000199');
    expect(r.jaCliente).toBe(false);
    expect(r.escritorio).toBeNull();
    expect(r.ultimoPedido).toBeNull();
  });

  it('jaCliente=false e não lança quando o portal erra (fail-safe)', async () => {
    portalGetMock.mockRejectedValue(new Error('portal down'));
    const r = await checkConflito('99999999000199');
    expect(r.jaCliente).toBe(false);
  });

  it('cnpj inválido (menos de 14 dígitos) não consulta o portal', async () => {
    const r = await checkConflito('123');
    expect(r.jaCliente).toBe(false);
    expect(portalGetMock).not.toHaveBeenCalled();
  });
});

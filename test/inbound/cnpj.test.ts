// test/inbound/cnpj.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichCnpj } from '@/lib/inbound/cnpj';

const RESP_PESCA = {
  razao_social: 'CACA E PESCA LTDA', nome_fantasia: 'PESQUEIRO DO ZE',
  cnae_fiscal: 4763603, cnae_fiscal_descricao: 'Comércio varejista de artigos de caça, pesca e camping',
  capital_social: 200000, data_inicio_atividade: '2015-03-01',
  qsa: [], cnaes_secundarios: [],
};

beforeEach(() => vi.restoreAllMocks());

describe('enrichCnpj', () => {
  it('marca fitSortimento=true e extrai porte quando CNAE é de caça/pesca', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => RESP_PESCA,
    }));
    const r = await enrichCnpj('12345678000199');
    expect(r.cnpjValido).toBe(true);
    expect(r.fitSortimento).toBe(true);
    expect(r.capitalSocial).toBe(200000);
    expect(r.razaoSocial).toBe('CACA E PESCA LTDA');
  });

  it('fitSortimento=false para CNAE sem relação (ex.: padaria)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ ...RESP_PESCA, cnae_fiscal_descricao: 'Padaria e confeitaria' }),
    }));
    const r = await enrichCnpj('12345678000199');
    expect(r.fitSortimento).toBe(false);
  });

  it('cnpjValido=false quando a BrasilAPI dá 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    const r = await enrichCnpj('00000000000000');
    expect(r.cnpjValido).toBe(false);
    expect(r.fitSortimento).toBe(false);
  });
});

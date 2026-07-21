// test/api/inbound-gpt-maker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createStaticAdminClient: () => ({
    from: (table: string) => {
      if (table === 'boards') return { select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: { id: 'board-1' } }) }) }) }) };
      if (table === 'board_stages') return { select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: { id: 'stage-preq' } }) }) }) }) };
      return { insert: (row: unknown) => { insertMock(row); return { select: () => ({ single: async () => ({ data: { id: 'deal-1' }, error: null }) }) }; } };
    },
  }),
}));
vi.mock('@/lib/inbound/cnpj', () => ({ enrichCnpj: async () => ({ fitSortimento: true, cnpjValido: true, razaoSocial: 'X', capitalSocial: 1, nomeFantasia: null, cnaePrincipal: null, cnaeDescricao: null, dataInicioAtividade: null, nFiliais: null }) }));
vi.mock('@/lib/inbound/conflito', () => ({ checkConflito: async () => ({ jaCliente: true, escritorio: 'REP GO', ultimoPedido: '2026-05-10' }) }));

import { POST } from '@/app/api/inbound/gpt-maker/route';

function req(body: unknown, secret?: string) {
  return new Request('http://x/api/inbound/gpt-maker', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret ? { 'x-internal-secret': secret } : {}) },
    body: JSON.stringify(body),
  });
}
const LEAD = { nomeLoja: 'Pesca Sul', cidade: 'Goiânia', uf: 'GO', cnpj: '12345678000199', sortimento: 'caça e pesca', marcas: 'Nautika', contatoNome: 'Zé', contatoWhatsapp: '5562999', transcript: '...', adReferral: 'ad-42' };

beforeEach(() => { insertMock.mockClear(); vi.stubEnv('INTERNAL_API_SECRET', 's3cr3t'); });

describe('POST /api/inbound/gpt-maker', () => {
  it('401 sem secret', async () => {
    const r = await POST(req(LEAD));
    expect(r.status).toBe(401);
  });
  it('400 sem cnpj', async () => {
    const r = await POST(req({ ...LEAD, cnpj: '' }, 's3cr3t'));
    expect(r.status).toBe(400);
  });
  it('400 (não 500) quando cnpj vem como número', async () => {
    const r = await POST(req({ ...LEAD, cnpj: 12345678000199 }, 's3cr3t'));
    expect(r.status).toBe(400);
  });
  it('cria deal em Pré-qualificado com porte + flag de conflito', async () => {
    const r = await POST(req(LEAD, 's3cr3t'));
    expect(r.status).toBe(200);
    const row = insertMock.mock.calls[0][0];
    expect(row.board_id).toBe('board-1');
    expect(row.stage_id).toBe('stage-preq');
    expect(row.title).toBe('Pesca Sul');
    expect(row.custom_fields.conflito.jaCliente).toBe(true);
    expect(row.custom_fields.porte.fitSortimento).toBe(true);
    expect(row.custom_fields.ad_referral).toBe('ad-42');
    expect(row.tags).toContain('conflito');
  });
});

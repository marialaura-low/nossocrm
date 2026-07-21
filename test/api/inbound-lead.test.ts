// test/api/inbound-lead.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertMock = vi.fn();
const updateMock = vi.fn();
const updateEqMock = vi.fn();
const selectEqMock = vi.fn();
// Card aberto que o lookup de dedup deve encontrar (null = não há duplicata).
let existingDeal: { id: string; stage_id: string } | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createStaticAdminClient: () => ({
    from: (table: string) => {
      if (table === 'boards') return { select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: { id: 'board-1' } }) }) }) }) };
      if (table === 'board_stages') return { select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: { id: 'stage-preq' } }) }) }) }) };
      // deals: suporta (1) lookup de dedup, (2) insert, (3) update
      const selectChain: {
        eq: (col: string, val: unknown) => typeof selectChain;
        limit: () => typeof selectChain;
        maybeSingle: () => Promise<{ data: typeof existingDeal; error: null }>;
      } = {
        eq: (col: string, val: unknown) => { selectEqMock(col, val); return selectChain; },
        limit: () => selectChain,
        maybeSingle: async () => ({ data: existingDeal, error: null }),
      };
      return {
        select: () => selectChain,
        insert: (row: unknown) => { insertMock(row); return { select: () => ({ single: async () => ({ data: { id: 'deal-1' }, error: null }) }) }; },
        update: (row: unknown) => {
          updateMock(row);
          return { eq: (col: string, val: unknown) => { updateEqMock(col, val); return { select: () => ({ single: async () => ({ data: { id: existingDeal?.id ?? 'deal-upd' }, error: null }) }) }; } };
        },
      };
    },
  }),
}));
vi.mock('@/lib/inbound/cnpj', () => ({ enrichCnpj: async () => ({ fitSortimento: true, cnpjValido: true, razaoSocial: 'X', capitalSocial: 1, nomeFantasia: null, cnaePrincipal: null, cnaeDescricao: null, dataInicioAtividade: null, nFiliais: null }) }));
vi.mock('@/lib/inbound/conflito', () => ({ checkConflito: async () => ({ jaCliente: true, escritorio: 'REP GO', ultimoPedido: '2026-05-10' }) }));

import { POST } from '@/app/api/inbound/lead/route';

function req(body: unknown, secret?: string) {
  return new Request('http://x/api/inbound/lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret ? { 'x-internal-secret': secret } : {}) },
    body: JSON.stringify(body),
  });
}
const LEAD = { nomeLoja: 'Pesca Sul', cidade: 'Goiânia', uf: 'GO', cnpj: '12345678000199', sortimento: 'caça e pesca', marcas: 'Nautika', contatoNome: 'Zé', contatoWhatsapp: '5562999', transcript: '...', adReferral: 'ad-42' };

beforeEach(() => {
  insertMock.mockClear(); updateMock.mockClear(); updateEqMock.mockClear(); selectEqMock.mockClear();
  existingDeal = null;
  vi.stubEnv('INTERNAL_API_SECRET', 's3cr3t');
});

describe('POST /api/inbound/lead', () => {
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

  // --- Dedup ---
  it('lookup de dedup filtra por card ABERTO e pelo CNPJ (não varre fechados)', async () => {
    await POST(req(LEAD, 's3cr3t'));
    const filtros = selectEqMock.mock.calls;
    expect(filtros).toContainEqual(['status', 'open']);
    expect(filtros).toContainEqual(["custom_fields->>cnpj", '12345678000199']);
    expect(filtros).toContainEqual(['board_id', 'board-1']);
  });

  it('sem card aberto do mesmo CNPJ → INSERT (comportamento atual), deduped false', async () => {
    existingDeal = null;
    const r = await POST(req(LEAD, 's3cr3t'));
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(updateMock).not.toHaveBeenCalled();
    expect(body.deduped).toBe(false);
    expect(body.dealId).toBe('deal-1');
  });

  it('card aberto do mesmo CNPJ → UPDATE, não INSERT; devolve o dealId existente + deduped true', async () => {
    existingDeal = { id: 'deal-open-1', stage_id: 'stage-closer' };
    const r = await POST(req(LEAD, 's3cr3t'));
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(insertMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateEqMock).toHaveBeenCalledWith('id', 'deal-open-1');
    expect(body.deduped).toBe(true);
    expect(body.dealId).toBe('deal-open-1');
  });

  it('dedup NÃO rebaixa o estágio (não toca stage_id do card que o Closer já move)', async () => {
    existingDeal = { id: 'deal-open-1', stage_id: 'stage-closer' };
    await POST(req(LEAD, 's3cr3t'));
    const upd = updateMock.mock.calls[0][0];
    expect(upd.stage_id).toBeUndefined();
  });

  it('dedup atualiza custom_fields (transcript novo) e marca a tag reengajou', async () => {
    existingDeal = { id: 'deal-open-1', stage_id: 'stage-preq' };
    await POST(req({ ...LEAD, transcript: 'segunda conversa' }, 's3cr3t'));
    const upd = updateMock.mock.calls[0][0];
    expect(upd.custom_fields.transcript).toBe('segunda conversa');
    expect(upd.custom_fields.cnpj).toBe('12345678000199');
    expect(upd.tags).toContain('reengajou');
    expect(upd.tags).toContain('conflito');
  });
});

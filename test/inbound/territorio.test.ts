// test/inbound/territorio.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const portalGetMock = vi.fn();
vi.mock('@/lib/portal/rest', () => ({ portalGet: (...a: unknown[]) => portalGetMock(...a) }));

import { checkTerritorio } from '@/lib/inbound/territorio';

beforeEach(() => { portalGetMock.mockReset(); });

describe('checkTerritorio', () => {
  it('normaliza cidade (acento+caixa) e uf, e mapeia a linha do portal', async () => {
    portalGetMock.mockResolvedValue([{
      rep_dominante: 'REP GO REPRESENTACAO COMERCIAL LTDA', disputado: false,
      cobertura_casa: true, responsavel_cobertura: 'Tiago',
    }]);
    const r = await checkTerritorio('Goiânia', 'go');
    expect(r.mapeado).toBe(true);
    expect(r.repDominante).toBe('REP GO REPRESENTACAO COMERCIAL LTDA');
    expect(r.disputado).toBe(false);
    expect(r.coberturaCasa).toBe(true);
    expect(r.responsavelCobertura).toBe('Tiago');
    // consultou com cidade normalizada (GOIANIA) e uf maiúsculo
    const url = portalGetMock.mock.calls[0][0] as string;
    expect(url).toContain('/territorio_cidade?');
    expect(url).toContain('cidade=eq.GOIANIA');
    expect(url).toContain('uf=eq.GO');
  });

  it('url-encoda cidade com espaço (APARECIDA DE GOIANIA)', async () => {
    portalGetMock.mockResolvedValue([]);
    await checkTerritorio('Aparecida de Goiânia', 'GO');
    const url = portalGetMock.mock.calls[0][0] as string;
    expect(url).toContain('cidade=eq.APARECIDA%20DE%20GOIANIA');
  });

  it('sem linha no mapa → mapeado=false (praça nova, não bloqueia)', async () => {
    portalGetMock.mockResolvedValue([]);
    const r = await checkTerritorio('Cidade Inexistente', 'TO');
    expect(r.mapeado).toBe(false);
    expect(r.coberturaCasa).toBe(false);
    expect(r.repDominante).toBeNull();
    expect(r.disputado).toBe(false);
  });

  it('portal fora → fail-safe (não lança, mapeado=false)', async () => {
    portalGetMock.mockRejectedValue(new Error('portal down'));
    const r = await checkTerritorio('Goiânia', 'GO');
    expect(r.mapeado).toBe(false);
  });

  it('cidade ou uf ausente → nem consulta o portal', async () => {
    const a = await checkTerritorio('', 'GO');
    const b = await checkTerritorio('Goiânia', '');
    expect(a.mapeado).toBe(false);
    expect(b.mapeado).toBe(false);
    expect(portalGetMock).not.toHaveBeenCalled();
  });
});

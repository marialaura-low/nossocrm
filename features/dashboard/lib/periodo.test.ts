import { describe, it, expect } from 'vitest';
import { periodoParaIntervalo } from './periodo';

// hoje fixo: 15/07/2026 (qua) — fim sempre EXCLUSIVO
const hoje = new Date(2026, 6, 15);

describe('periodoParaIntervalo', () => {
  it('this_month → mês corrente [1º, 1º do próximo)', () => {
    expect(periodoParaIntervalo('this_month', hoje)).toEqual({ inicio: '2026-07-01', fim: '2026-08-01' });
  });

  it('last_month → mês fechado', () => {
    expect(periodoParaIntervalo('last_month', hoje)).toEqual({ inicio: '2026-06-01', fim: '2026-07-01' });
  });

  it('this_quarter / last_quarter respeitam o trimestre civil', () => {
    expect(periodoParaIntervalo('this_quarter', hoje)).toEqual({ inicio: '2026-07-01', fim: '2026-10-01' });
    expect(periodoParaIntervalo('last_quarter', hoje)).toEqual({ inicio: '2026-04-01', fim: '2026-07-01' });
  });

  it('this_year / last_year', () => {
    expect(periodoParaIntervalo('this_year', hoje)).toEqual({ inicio: '2026-01-01', fim: '2027-01-01' });
    expect(periodoParaIntervalo('last_year', hoje)).toEqual({ inicio: '2025-01-01', fim: '2026-01-01' });
  });

  it('today / yesterday com fim exclusivo', () => {
    expect(periodoParaIntervalo('today', hoje)).toEqual({ inicio: '2026-07-15', fim: '2026-07-16' });
    expect(periodoParaIntervalo('yesterday', hoje)).toEqual({ inicio: '2026-07-14', fim: '2026-07-15' });
  });

  it('janelas móveis cruzam o mês sem quebrar', () => {
    expect(periodoParaIntervalo('last_7_days', hoje)).toEqual({ inicio: '2026-07-08', fim: '2026-07-16' });
    expect(periodoParaIntervalo('last_30_days', hoje)).toEqual({ inicio: '2026-06-15', fim: '2026-07-16' });
  });

  it('all → histórico completo do banco (sell_in começa 2023)', () => {
    expect(periodoParaIntervalo('all', hoje)).toEqual({ inicio: '2023-01-01', fim: '2026-07-16' });
  });
});

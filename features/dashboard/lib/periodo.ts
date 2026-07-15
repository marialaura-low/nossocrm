import type { PeriodFilter } from '../hooks/useDashboardMetrics';

/**
 * Traduz o filtro de período do dashboard pra o intervalo [inicio, fim) que o
 * /api/portal-metricas (e as RPCs do portal) esperam — fim EXCLUSIVO, datas locais.
 * 'all' vira histórico completo do banco (sell_in começa em 2023).
 */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function periodoParaIntervalo(period: PeriodFilter, hoje: Date = new Date()): { inicio: string; fim: string } {
  const y = hoje.getFullYear();
  const m = hoje.getMonth();
  const d = hoje.getDate();
  const amanha = new Date(y, m, d + 1);

  switch (period) {
    case 'today':
      return { inicio: iso(new Date(y, m, d)), fim: iso(amanha) };
    case 'yesterday':
      return { inicio: iso(new Date(y, m, d - 1)), fim: iso(new Date(y, m, d)) };
    case 'last_7_days':
      return { inicio: iso(new Date(y, m, d - 7)), fim: iso(amanha) };
    case 'last_30_days':
      return { inicio: iso(new Date(y, m, d - 30)), fim: iso(amanha) };
    case 'this_month':
      return { inicio: iso(new Date(y, m, 1)), fim: iso(new Date(y, m + 1, 1)) };
    case 'last_month':
      return { inicio: iso(new Date(y, m - 1, 1)), fim: iso(new Date(y, m, 1)) };
    case 'this_quarter': {
      const q = Math.floor(m / 3) * 3;
      return { inicio: iso(new Date(y, q, 1)), fim: iso(new Date(y, q + 3, 1)) };
    }
    case 'last_quarter': {
      const q = Math.floor(m / 3) * 3;
      return { inicio: iso(new Date(y, q - 3, 1)), fim: iso(new Date(y, q, 1)) };
    }
    case 'this_year':
      return { inicio: `${y}-01-01`, fim: `${y + 1}-01-01` };
    case 'last_year':
      return { inicio: `${y - 1}-01-01`, fim: `${y}-01-01` };
    case 'all':
    default:
      return { inicio: '2023-01-01', fim: iso(amanha) };
  }
}

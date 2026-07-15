'use client';

import React from 'react';
import { TrendingUp } from 'lucide-react';
import { usePortalMetricas } from '../hooks/usePortalMetricas';
import { usePortalScope } from '../context/PortalScopeContext';

/**
 * Recompra por segmento (≤120d) — a "métrica de ouro" da Macboot, no dashboard.
 * Dado real do MIOLO do portal (`funil_baseline`), via GET /api/portal-metricas.
 * É a primeira métrica calçadista da fusão: um CRM genérico não sabe ler isso.
 */
const SEG_LABELS: Record<string, string> = {
  loja_independente: 'Loja independente',
  rede: 'Rede',
  ecommerce_marketplace: 'Marketplace',
  hibrido: 'Híbrido',
  empresa_uso_proprio: 'Empresa (uso próprio)',
  cliente_final_sac: 'Cliente final/SAC',
  exportacao: 'Exportação',
  TOTAL: 'Total',
};

export const RecompraSegmentoSection: React.FC = () => {
  const { data, isLoading, isError } = usePortalMetricas();
  const { escritorio } = usePortalScope();

  const all = data?.recompra_segmento ?? [];
  const rows = all.filter((r) => r.segmento !== 'TOTAL');
  const total = all.find((r) => r.segmento === 'TOTAL');

  return (
    <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-slate-700 dark:text-white flex items-center gap-2">
          <TrendingUp size={16} className="text-primary-600 dark:text-primary-400" aria-hidden="true" />
          Recompra por segmento
        </h3>
        <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">≤120d · métrica de ouro</span>
      </div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4">
        % de clientes que recompraram em até 120 dias da entrega — a alavanca do pós-venda, por tipo de cliente.
      </p>

      {escritorio && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-3 -mt-2">
          Leitura macro (carteira toda) — o baseline por segmento ainda não decupla por escritório.
        </p>
      )}

      {isError && <p className="text-xs text-red-500">Não consegui puxar do portal agora.</p>}
      {isLoading && <p className="text-xs text-slate-400 dark:text-slate-500">Carregando do portal…</p>}

      {!isLoading && !isError && (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.segmento}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600 dark:text-slate-300 font-medium">{SEG_LABELS[r.segmento] ?? r.segmento}</span>
                <span className="text-slate-500 dark:text-slate-400">
                  <b className="text-slate-800 dark:text-white">{r.pct}%</b> · {r.n} clientes
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.min(100, Math.max(0, r.pct))}%` }} />
              </div>
            </div>
          ))}
          {total && (
            <div className="pt-3 mt-1 border-t border-slate-100 dark:border-white/5 flex justify-between items-baseline">
              <span className="text-xs font-bold text-slate-700 dark:text-white">Total da carteira</span>
              <span className="text-lg font-bold text-primary-600 dark:text-primary-400">{total.pct}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RecompraSegmentoSection;

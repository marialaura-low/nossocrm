'use client';

import React from 'react';
import { Snowflake } from 'lucide-react';
import { formatBRL } from '@/lib/utils/currency';
import { usePortalMetricas } from '../hooks/usePortalMetricas';

/**
 * Esfriamento (churn) — o espelho da reativação: clientes cuja última compra completou
 * 120 dias DENTRO do período (cruzaram a linha agora; não é o estoque de quem já estava
 * frio). Base emissão — pedido na casa conta como ativo (lei do pedido na casa).
 * valor_12m = sell-in dos últimos 12 meses desses clientes: o tamanho do que esfria.
 * Quem aparece aqui é quem o funil de reativação do portal vai buscar.
 */
const nf = new Intl.NumberFormat('pt-BR');

export const ChurnSection: React.FC = () => {
  const { data, isLoading, isError } = usePortalMetricas();
  const c = data?.churn ?? null;

  return (
    <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-bold text-slate-700 dark:text-white flex items-center gap-2">
          <Snowflake size={16} className="text-sky-600 dark:text-sky-400" aria-hidden="true" />
          Esfriamento
        </h3>
        <span className="text-[11px] text-slate-400 uppercase tracking-wide">churn · mês corrente</span>
      </div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4">
        Clientes que completaram 120 dias sem comprar neste período — o espelho da reativação.
      </p>

      {isError && <p className="text-xs text-red-500">Não consegui puxar o esfriamento do portal agora.</p>}
      {isLoading && <p className="text-xs text-slate-400 dark:text-slate-500">Carregando do portal…</p>}
      {!isLoading && !isError && !c && (
        <p className="text-xs text-slate-400 dark:text-slate-500">Sem dado de esfriamento no período.</p>
      )}

      {c && (
        <>
          <div className="flex items-end gap-6 flex-wrap">
            <div>
              <p className="text-3xl font-bold text-slate-800 dark:text-white leading-none">{nf.format(c.clientes)}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">clientes esfriaram</p>
            </div>
            <div>
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400 leading-none">{formatBRL(c.valor_12m)}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">sell-in 12m em risco</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-4 pt-3 border-t border-slate-100 dark:border-white/5">
            Esses clientes entram na fila de reativação do portal — esfriou, o rep liga.
          </p>
        </>
      )}
    </div>
  );
};

export default ChurnSection;

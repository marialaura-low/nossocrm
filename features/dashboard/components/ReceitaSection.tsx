'use client';

import React from 'react';
import { ArrowUpRight, Truck } from 'lucide-react';
import { formatBRL } from '@/lib/utils/currency';
import { usePortalMetricas, type CanalFechamento } from '../hooks/usePortalMetricas';

/**
 * Receita — os DOIS cards da doutrina emissão × entrega, com dado real do portal
 * (RPC canônica `fechamento_comercial`). É o que consertou o dashboard zerado: o
 * card genérico de "Receita" lia deals-espelho (sem valor); aqui lê o faturamento
 * e o sell_in de verdade. Emissão = pedido colocado (sell_in); Entrega = nota
 * fiscal (faturamento). Nunca somar os dois — são instâncias diferentes.
 */
const nf = new Intl.NumberFormat('pt-BR');

const ReceitaCard: React.FC<{
  titulo: string;
  legenda: string;
  valor: number;
  pares: number;
  icon: React.ReactNode;
  accent: string;
}> = ({ titulo, legenda, valor, pares, icon, accent }) => (
  <div className="flex-1 bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-bold text-slate-700 dark:text-white flex items-center gap-2">
        <span className={accent}>{icon}</span>
        {titulo}
      </span>
      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{legenda}</span>
    </div>
    <p className="text-2xl font-bold text-slate-800 dark:text-white leading-tight">{formatBRL(valor)}</p>
    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{nf.format(pares)} pares</p>
  </div>
);

export const ReceitaSection: React.FC = () => {
  const { data, isLoading, isError } = usePortalMetricas();
  const receita = data?.receita ?? null;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-700 dark:text-white">Receita</h3>
        <span className="text-[11px] text-slate-400 uppercase tracking-wide">emissão × entrega · mês corrente</span>
      </div>

      {isError && <p className="text-xs text-red-500">Não consegui puxar a receita do portal agora.</p>}
      {isLoading && <p className="text-xs text-slate-400 dark:text-slate-500">Carregando do portal…</p>}
      {!isLoading && !isError && !receita && (
        <p className="text-xs text-slate-400 dark:text-slate-500">Sem dado de receita no período.</p>
      )}

      {receita && (
        <>
          <div className="flex flex-col sm:flex-row gap-4">
            <ReceitaCard
              titulo="Emissão"
              legenda="sell-in · pedido colocado"
              valor={receita.total.valor_emitido}
              pares={receita.total.pares_emitidos}
              icon={<ArrowUpRight size={16} aria-hidden="true" />}
              accent="text-primary-600 dark:text-primary-400"
            />
            <ReceitaCard
              titulo="Entrega"
              legenda="faturamento · nota fiscal"
              valor={receita.total.valor_entregue}
              pares={receita.total.pares_entregues}
              icon={<Truck size={16} aria-hidden="true" />}
              accent="text-amber-600 dark:text-amber-400"
            />
          </div>

          {receita.canais.length > 0 && (
            <div className="mt-4 bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 dark:text-slate-500 text-left">
                    <th className="font-medium pb-2">Canal</th>
                    <th className="font-medium pb-2 text-right">Emitido</th>
                    <th className="font-medium pb-2 text-right">Entregue</th>
                  </tr>
                </thead>
                <tbody>
                  {receita.canais.map((c: CanalFechamento) => (
                    <tr key={c.canal} className="border-t border-slate-100 dark:border-white/5">
                      <td className="py-2 text-slate-600 dark:text-slate-300 font-medium">{c.canal}</td>
                      <td className="py-2 text-right text-slate-700 dark:text-white">{formatBRL(c.valor_emitido)}</td>
                      <td className="py-2 text-right text-slate-500 dark:text-slate-400">{formatBRL(c.valor_entregue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ReceitaSection;

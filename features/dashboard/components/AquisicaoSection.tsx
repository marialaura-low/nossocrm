'use client';

import React from 'react';
import { UserPlus } from 'lucide-react';
import { usePortalMetricas, type MesAquisicao } from '../hooks/usePortalMetricas';

/**
 * Aquisição — novos clientes por mês (série + acumulado no ano). Novo = cliente cuja
 * primeira emissão na história cai no mês (RPC canônica `aquisicao_mensal`, base
 * v_sell_in_canal com histórico desde 2023). Aceita escritório → micro→macro.
 * A meta de novos / gap entram quando a Low definir o número (não fabricado aqui).
 */
const nf = new Intl.NumberFormat('pt-BR');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function rotuloMes(iso: string): string {
  const m = Number(iso.slice(5, 7)) - 1;
  return MESES[m] ?? iso.slice(5, 7);
}

export const AquisicaoSection: React.FC = () => {
  const { data, isLoading, isError } = usePortalMetricas();
  const aq = data?.aquisicao ?? null;

  const serie = aq?.serie ?? [];
  const maxNovos = serie.reduce((m, x) => Math.max(m, x.novos), 0);

  return (
    <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-bold text-slate-700 dark:text-white flex items-center gap-2">
          <UserPlus size={16} className="text-primary-600 dark:text-primary-400" aria-hidden="true" />
          Aquisição
        </h3>
        <span className="text-[11px] text-slate-400 uppercase tracking-wide">novos clientes · no ano</span>
      </div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4">
        Clientes que compraram pela 1ª vez — por mês e acumulado no ano.
      </p>

      {isError && <p className="text-xs text-red-500">Não consegui puxar a aquisição do portal agora.</p>}
      {isLoading && <p className="text-xs text-slate-400 dark:text-slate-500">Carregando do portal…</p>}
      {!isLoading && !isError && !aq && (
        <p className="text-xs text-slate-400 dark:text-slate-500">Sem dado de aquisição no período.</p>
      )}

      {aq && (
        <>
          <div className="flex items-end gap-6 mb-5">
            <div>
              <p className="text-3xl font-bold text-slate-800 dark:text-white leading-none">{nf.format(aq.atual?.novos ?? 0)}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">no mês {aq.atual ? `(${rotuloMes(aq.atual.mes)}, parcial)` : ''}</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-primary-600 dark:text-primary-400 leading-none">{nf.format(aq.ytd.novos)}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">no ano · {nf.format(aq.ytd.pares)} pares</p>
            </div>
            {aq.meta_novos != null && (
              <div>
                <p className="text-3xl font-bold text-slate-400 dark:text-slate-500 leading-none">
                  {Math.round((aq.ytd.novos / aq.meta_novos) * 100)}%
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  da meta {nf.format(aq.meta_novos)} · faltam {nf.format(Math.max(0, aq.meta_novos - aq.ytd.novos))}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-end gap-1.5 h-20">
            {serie.map((m: MesAquisicao, idx: number) => {
              const h = maxNovos > 0 ? (m.novos / maxNovos) * 100 : 0;
              const atual = idx === serie.length - 1;
              return (
                <div key={m.mes} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${nf.format(m.novos)} novos`}>
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{m.novos}</span>
                  <div className="w-full flex items-end" style={{ height: '3.5rem' }}>
                    <div
                      className={`w-full rounded-t ${atual ? 'bg-primary-300 dark:bg-primary-500/50' : 'bg-primary-500'}`}
                      style={{ height: `${Math.max(4, h)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">{rotuloMes(m.mes)}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 pt-3 border-t border-slate-100 dark:border-white/5">
            {aq.meta_novos != null
              ? `Meta ${nf.format(aq.meta_novos)} novos/ano (projeção 2026, editável). Último mês é parcial.`
              : aq.escritorio
                ? 'Meta por escritório ainda não cadastrada — mostrando o ritmo real.'
                : 'Meta de novos entra quando cadastrada — hoje o card mostra o ritmo real.'}
          </p>
        </>
      )}
    </div>
  );
};

export default AquisicaoSection;

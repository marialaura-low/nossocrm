'use client';

import React from 'react';
import { Target } from 'lucide-react';
import { usePortalMetricas, type ForecastMes } from '../hooks/usePortalMetricas';

/**
 * Forecast Atacado — pacing vs plano, em três camadas (decisão Low 14/07):
 *   META      = o compromisso do ano (âncora; não muda com o ritmo);
 *   TENDÊNCIA = onde o ano fecha SE o ritmo dos meses fechados continuar;
 *   ESFORÇO   = o que os meses restantes precisam rodar vs o plano deles pra
 *               ainda bater a meta — a linha de ação.
 * Super meta (editável, opcional): alvo esticado acima do compromisso.
 * Realizado = emissão B2B (v_sell_in_canal). Emissão, não entrega.
 */
const nf = new Intl.NumberFormat('pt-BR');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const ForecastSection: React.FC = () => {
  const { data, isLoading, isError } = usePortalMetricas();
  const f = data?.forecast ?? null;

  const maxBar = f ? f.serie.reduce((m, x) => Math.max(m, x.meta, x.realizado ?? 0), 0) : 0;
  const noAlvo = f?.gap_ano != null && f.gap_ano >= 0;

  return (
    <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-bold text-slate-700 dark:text-white flex items-center gap-2">
          <Target size={16} className="text-primary-600 dark:text-primary-400" aria-hidden="true" />
          Forecast Atacado
        </h3>
        <span className="text-[11px] text-slate-400 uppercase tracking-wide">pares · emissão</span>
      </div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4">
        A meta é o compromisso; a tendência é onde o ano fecha no ritmo atual.
      </p>

      {isError && <p className="text-xs text-red-500">Não consegui puxar o forecast do portal agora.</p>}
      {isLoading && <p className="text-xs text-slate-400 dark:text-slate-500">Carregando do portal…</p>}
      {!isLoading && !isError && !f && (
        <p className="text-xs text-slate-400 dark:text-slate-500">Sem curva de meta cadastrada pra projetar.</p>
      )}

      {f && (
        <>
          <div className="flex items-end gap-6 mb-1 flex-wrap">
            <div>
              <p className="text-3xl font-bold text-slate-800 dark:text-white leading-none">{nf.format(f.meta_ano)}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">meta do ano · compromisso</p>
            </div>
            <div>
              <p className={`text-2xl font-bold leading-none ${noAlvo ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {f.projecao_ano != null ? nf.format(f.projecao_ano) : '—'}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">tendência · no ritmo atual</p>
            </div>
            {f.gap_ano != null && (
              <div>
                <p className={`text-2xl font-bold leading-none ${noAlvo ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                  {f.gap_ano >= 0 ? '+' : '−'}{nf.format(Math.abs(f.gap_ano))}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">gap vs meta</p>
              </div>
            )}
          </div>

          {f.atingimento_fechado != null && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Base: {f.meses_fechados} meses fechados a <b className="text-slate-600 dark:text-slate-300">{Math.round(f.atingimento_fechado * 100)}%</b> do plano
              ({nf.format(f.realizado_fechado)} de {nf.format(f.meta_fechado)} pares).
            </p>
          )}
          {f.esforco_restante != null && (
            <p className="text-xs mt-1.5 mb-4 font-medium text-slate-600 dark:text-slate-300">
              Pra bater a meta, os meses restantes precisam rodar a{' '}
              <b className={f.esforco_restante > 1 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
                {Math.round(f.esforco_restante * 100)}%
              </b>{' '}
              do plano deles ({nf.format(Math.max(0, f.meta_ano - f.realizado_fechado))} de {nf.format(f.meta_restante)} pares planejados).
            </p>
          )}
          {f.super_meta != null && f.esforco_super != null && (
            <p className="text-[11px] -mt-2 mb-4 text-slate-400 dark:text-slate-500">
              Super meta {nf.format(f.super_meta)}: exige {Math.round(f.esforco_super * 100)}% do plano restante.
              {f.super_meta_obs && <span className="text-amber-600 dark:text-amber-400"> · {f.super_meta_obs}</span>}
            </p>
          )}

          <div className="flex items-end gap-1 h-24">
            {f.serie.map((m: ForecastMes) => {
              const hMeta = maxBar > 0 ? (m.meta / maxBar) * 100 : 0;
              const hReal = maxBar > 0 && m.realizado != null ? (m.realizado / maxBar) * 100 : 0;
              const bateu = m.realizado != null && m.realizado >= m.meta;
              return (
                <div key={m.mes} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`meta ${nf.format(m.meta)} · realizado ${m.realizado != null ? nf.format(m.realizado) : '—'}`}>
                  <div className="w-full flex items-end justify-center gap-px" style={{ height: '4.5rem' }}>
                    {/* meta (fantasma) */}
                    <div className="w-1/2 rounded-t bg-slate-200 dark:bg-white/10" style={{ height: `${Math.max(2, hMeta)}%` }} />
                    {/* realizado */}
                    {m.realizado != null && (
                      <div className={`w-1/2 rounded-t ${bateu ? 'bg-emerald-500' : 'bg-primary-500'}`} style={{ height: `${Math.max(2, hReal)}%` }} />
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">{MESES[m.mes - 1]}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3">
            Barra clara = meta · colorida = realizado (verde bateu). Meta editável (projeção 2026).
          </p>
        </>
      )}
    </div>
  );
};

export default ForecastSection;

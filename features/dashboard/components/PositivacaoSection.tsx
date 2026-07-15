'use client';

import React from 'react';
import { UserCheck, RotateCcw, Sparkles } from 'lucide-react';
import { usePortalMetricas, type PilarPositivacao } from '../hooks/usePortalMetricas';
import { usePortalScope } from '../context/PortalScopeContext';

/**
 * Positivação em 3 pilares — a leitura só-Macboot de quem comprou no mês e DE ONDE
 * veio o volume. Positivado = cliente que emitiu pedido no mês; decomposto em
 * retenção (recomprou dentro do ciclo ≤120d), reativação (voltou depois de esfriar)
 * e novos (1ª compra). Dado real do portal via RPC canônica `positivacao_mensal`
 * (aceita escritório → micro→macro: gestão vê a soma, rep veria a carteira dele).
 */
const nf = new Intl.NumberFormat('pt-BR');

const PILARES: Record<string, { label: string; hint: string; icon: React.ReactNode; accent: string; bar: string }> = {
  retencao: { label: 'Retenção', hint: 'recompra ≤120d', icon: <UserCheck size={16} aria-hidden="true" />, accent: 'text-primary-600 dark:text-primary-400', bar: 'bg-primary-500' },
  reativacao: { label: 'Reativação', hint: 'voltou depois de esfriar', icon: <RotateCcw size={16} aria-hidden="true" />, accent: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' },
  novo: { label: 'Novos', hint: '1ª compra', icon: <Sparkles size={16} aria-hidden="true" />, accent: 'text-sky-600 dark:text-sky-400', bar: 'bg-sky-500' },
};
const ORDEM = ['retencao', 'reativacao', 'novo'];

export const PositivacaoSection: React.FC = () => {
  const { data, isLoading, isError } = usePortalMetricas();
  const { periodoLabel } = usePortalScope();
  const pos = data?.positivacao ?? null;

  const byPilar = new Map((pos?.pilares ?? []).map((p: PilarPositivacao) => [p.pilar, p]));
  const totalPares = pos?.total.pares ?? 0;

  return (
    <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-bold text-slate-700 dark:text-white">Positivação</h3>
        <span className="text-[11px] text-slate-400 uppercase tracking-wide">3 pilares · {periodoLabel ?? 'mês corrente'}</span>
      </div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4">
        Quem comprou no mês e de onde veio o volume — retenção, reativação e novos.
      </p>

      {isError && <p className="text-xs text-red-500">Não consegui puxar a positivação do portal agora.</p>}
      {isLoading && <p className="text-xs text-slate-400 dark:text-slate-500">Carregando do portal…</p>}
      {!isLoading && !isError && !pos && (
        <p className="text-xs text-slate-400 dark:text-slate-500">Sem dado de positivação no período.</p>
      )}

      {pos && (
        <>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">{nf.format(pos.total.clientes)}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">clientes positivados · {nf.format(pos.total.pares)} pares</span>
          </div>
          {pos.carteira?.pct != null && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4">
              <b className="text-slate-600 dark:text-slate-300">{pos.carteira.pct}%</b> da carteira ativa
              ({nf.format(pos.carteira.positivados)} de {nf.format(pos.carteira.carteira)} clientes com compra nos últimos 12 meses).
            </p>
          )}
          {pos.carteira?.pct == null && <div className="mb-3" />}

          <div className="space-y-3">
            {ORDEM.map((key) => {
              const p = byPilar.get(key);
              const meta = PILARES[key];
              const clientes = p?.clientes ?? 0;
              const pares = p?.pares ?? 0;
              const share = totalPares > 0 ? (pares / totalPares) * 100 : 0;
              return (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <span className={meta.accent}>{meta.icon}</span>
                      {meta.label}
                      <span className="text-slate-400 dark:text-slate-500 font-normal">· {meta.hint}</span>
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      <b className="text-slate-800 dark:text-white">{nf.format(clientes)} clientes</b> · {nf.format(pares)} pares
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                    <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${Math.min(100, Math.max(0, share))}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3">Barras = participação nos pares do mês.</p>
        </>
      )}
    </div>
  );
};

export default PositivacaoSection;

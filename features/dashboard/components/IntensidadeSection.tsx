'use client';

import React from 'react';
import { Wallet, Receipt, Repeat } from 'lucide-react';
import { formatBRL } from '@/lib/utils/currency';
import { usePortalMetricas } from '../hooks/usePortalMetricas';

/**
 * Intensidade de compra — ARPU, ticket médio e frequência, ligados pela identidade
 * ARPU = ticket × frequência. Dado real via RPC canônica `intensidade_compra_mensal`
 * (mesma base da Receita → o valor reconcilia com o card de Receita). ARPU = quanto
 * cada cliente rende no mês; ticket = tamanho do pedido; frequência = quantos pedidos
 * por cliente. Aceita escritório → micro→macro.
 */
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Metrica: React.FC<{
  titulo: string;
  hint: string;
  valor: string;
  sub: string;
  icon: React.ReactNode;
  accent: string;
}> = ({ titulo, hint, valor, sub, icon, accent }) => (
  <div className="flex-1 min-w-0">
    <div className="flex items-center gap-1.5 mb-1">
      <span className={accent}>{icon}</span>
      <span className="text-xs font-bold text-slate-700 dark:text-white">{titulo}</span>
    </div>
    <p className="text-xl font-bold text-slate-800 dark:text-white leading-tight truncate">{valor}</p>
    <p className="text-[11px] text-slate-400 dark:text-slate-500">{sub}</p>
    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{hint}</p>
  </div>
);

export const IntensidadeSection: React.FC = () => {
  const { data, isLoading, isError } = usePortalMetricas();
  const i = data?.intensidade ?? null;

  return (
    <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-bold text-slate-700 dark:text-white">Intensidade de compra</h3>
        <span className="text-[11px] text-slate-400 uppercase tracking-wide">ARPU = ticket × frequência</span>
      </div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4">
        Quanto cada cliente rende, o tamanho do pedido e quantas vezes compra no mês.
      </p>

      {isError && <p className="text-xs text-red-500">Não consegui puxar a intensidade do portal agora.</p>}
      {isLoading && <p className="text-xs text-slate-400 dark:text-slate-500">Carregando do portal…</p>}
      {!isLoading && !isError && !i && (
        <p className="text-xs text-slate-400 dark:text-slate-500">Sem dado de intensidade no período.</p>
      )}

      {i && (
        <>
          <div className="flex gap-4">
            <Metrica
              titulo="ARPU"
              hint="receita ÷ clientes"
              valor={formatBRL(i.arpu)}
              sub="por cliente"
              icon={<Wallet size={15} aria-hidden="true" />}
              accent="text-primary-600 dark:text-primary-400"
            />
            <Metrica
              titulo="Ticket médio"
              hint="receita ÷ pedidos"
              valor={formatBRL(i.ticket_medio)}
              sub="por pedido"
              icon={<Receipt size={15} aria-hidden="true" />}
              accent="text-amber-600 dark:text-amber-400"
            />
            <Metrica
              titulo="Frequência"
              hint="pedidos ÷ clientes"
              valor={nf2.format(i.frequencia)}
              sub="pedidos/cliente"
              icon={<Repeat size={15} aria-hidden="true" />}
              accent="text-sky-600 dark:text-sky-400"
            />
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-4 pt-3 border-t border-slate-100 dark:border-white/5">
            Base: {i.clientes} clientes · {i.pedidos} pedidos · {formatBRL(i.valor)} emitidos no mês.
          </p>
        </>
      )}
    </div>
  );
};

export default IntensidadeSection;

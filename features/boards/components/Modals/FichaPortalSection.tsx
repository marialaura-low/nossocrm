'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Store, PackageCheck } from 'lucide-react';

/**
 * Ficha rica do Maré (item A da união) — o MIOLO do portal dentro do deal-espelho.
 * Read-only (spec união §4.1): mostra segmento, ritmo, pedido na casa, últimos pedidos
 * COM A LOJA que recebeu (feedback Alex/Green Shoes — edge v12) e a última anotação.
 * A fonte é o portal; aqui não se edita nada.
 */
interface Pedido {
  pedido: string;
  data: string;
  pares: number;
  desconto: number | null;
  loja: { cnpj: string | null; fantasia: string | null } | null;
}

interface Ficha {
  ritmo: { n_pedidos: number; pares_12m: number } | null;
  historico: Pedido[] | null;
  segmento: { modelo_negocio: string; nicho: string; segmento_confirmado: boolean } | null;
  pedido_na_casa: { ativo: boolean; pares: number; entrega: string | null } | null;
  ultima_anotacao: { nota: string; em: string; por: string } | null;
}

const SEG_LABEL: Record<string, string> = {
  loja_independente: 'Loja independente',
  rede: 'Rede',
  ecommerce_marketplace: 'Marketplace',
  hibrido: 'Híbrido',
  empresa_uso_proprio: 'Empresa (uso próprio)',
  cliente_final_sac: 'Cliente final/SAC',
  exportacao: 'Exportação',
};

const nf = new Intl.NumberFormat('pt-BR');
const dt = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '—');

export const FichaPortalSection: React.FC<{ matriz: string; escritorio: string }> = ({ matriz, escritorio }) => {
  const { data, isLoading, isError } = useQuery<Ficha>({
    queryKey: ['portal-ficha', matriz, escritorio],
    queryFn: async () => {
      const qs = new URLSearchParams({ matriz, escritorio });
      const r = await fetch(`/api/portal-ficha?${qs}`);
      if (!r.ok) throw new Error('falha ao buscar a ficha do portal');
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const seg = data?.segmento ?? null;
  const pedidos = (data?.historico ?? []).slice(0, 5);

  return (
    <div>
      <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">
        <Store size={14} aria-hidden="true" /> Ficha Macboot · portal
      </h3>

      {isLoading && <p className="text-xs text-slate-400 dark:text-slate-500">Carregando do portal…</p>}
      {isError && <p className="text-xs text-red-500">Não consegui puxar a ficha do portal agora.</p>}

      {data && (
        <div className="space-y-3 text-xs">
          {seg && (
            <p className="text-slate-600 dark:text-slate-300">
              {SEG_LABEL[seg.modelo_negocio] ?? seg.modelo_negocio} · {seg.nicho}
              {!seg.segmento_confirmado && <span className="text-amber-600 dark:text-amber-400"> · a confirmar</span>}
            </p>
          )}

          {data.ritmo && (
            <p className="text-slate-500 dark:text-slate-400">
              {nf.format(data.ritmo.n_pedidos)} pedidos · {nf.format(data.ritmo.pares_12m)} pares em 12m
            </p>
          )}

          {data.pedido_na_casa?.ativo && (
            <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
              <PackageCheck size={13} aria-hidden="true" />
              Pedido na casa: {nf.format(data.pedido_na_casa.pares)} pares
              {data.pedido_na_casa.entrega ? ` · entrega ${dt(data.pedido_na_casa.entrega)}` : ''}
            </p>
          )}

          {pedidos.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Últimos pedidos</p>
              <ul className="space-y-1">
                {pedidos.map((p) => (
                  <li key={p.pedido} className="flex items-baseline justify-between gap-2">
                    <span className="text-slate-600 dark:text-slate-300 truncate">
                      {dt(p.data)} · {nf.format(p.pares)} pares
                      {p.loja?.fantasia && (
                        <span className="text-slate-400 dark:text-slate-500"> · {p.loja.fantasia}</span>
                      )}
                    </span>
                    {p.desconto != null && <span className="text-slate-400 shrink-0">{p.desconto}%</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!isLoading && pedidos.length === 0 && (
            <p className="text-slate-400 dark:text-slate-500">Sem histórico de pedidos no portal pra esta matriz.</p>
          )}

          {data.ultima_anotacao && (
            <p className="text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-white/5 pt-2">
              <span className="font-medium text-slate-600 dark:text-slate-300">Última anotação</span> ({dt(data.ultima_anotacao.em)}, {data.ultima_anotacao.por}): {data.ultima_anotacao.nota}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default FichaPortalSection;

'use client';

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Clock, PhoneOff, ThumbsDown } from 'lucide-react';
import { DEALS_VIEW_KEY } from '@/lib/query';

interface PortalActionPanelProps {
  dealId: string;
  /** Papel do usuário logado. Reservado para o override manual de etapa (gestão) — task futura. */
  isAdmin?: boolean;
  /** Chamado após um registro bem-sucedido (o cache de deals já foi invalidado). */
  onDone: () => void;
}

/**
 * Taxonomia real de motivo de perda (tabela `motivos_perda` do portal dos representantes).
 * Manter em sincronia com o banco. `sem_contato` fica de fora desta lista — já é coberto
 * pelo botão dedicado "Não consegui contato" acima.
 */
const MOTIVOS_PERDA: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: 'sem_giro', label: 'Produto não girou' },
  { slug: 'preco', label: 'Preço' },
  { slug: 'concorrencia', label: 'Concorrência' },
  { slug: 'loja_fechou_encolheu', label: 'Loja fechou/encolheu' },
  { slug: 'troca_comprador', label: 'Troca de comprador' },
  { slug: 'inadimplencia_credito', label: 'Inadimplência/crédito' },
  { slug: 'outro', label: 'Outro' },
];

/**
 * Painel "Registrar ação" — renderizado no lugar do controle manual de mudança de estágio
 * em boards regidos por `motor` (espelho do funil do portal). Nesses boards a etapa muda
 * como consequência de um evento registrado, nunca por arraste/clique manual: cada botão
 * aqui registra um resultado de contato via `POST /api/portal-action`, que escreve no
 * portal (edge `funil-update`) e dispara um re-sync imediato do espelho.
 *
 * @see DealDetailModal.tsx — decide quando renderizar este painel (board.regidoPor === 'motor').
 */
export const PortalActionPanel: React.FC<PortalActionPanelProps> = ({ dealId, isAdmin, onDone }) => {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [motivoSlug, setMotivoSlug] = useState<string>(MOTIVOS_PERDA[0].slug);
  const [obs, setObs] = useState('');

  const registrar = async (payload: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/portal-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId, ...payload }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error || `Falha ao registrar ação (HTTP ${res.status})`);
        return;
      }
      // DEALS_VIEW_KEY é a única fonte de verdade dos deals (Kanban + esta ficha).
      // O servidor já disparou o re-sync do espelho; só falta o cliente puxar o dado fresco.
      await queryClient.invalidateQueries({ queryKey: DEALS_VIEW_KEY });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar ação.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-4 space-y-3">
      <p className="text-sm font-bold text-slate-700 dark:text-white">
        Registrar ação{' '}
        <span className="font-normal text-slate-500 dark:text-slate-400">
          (funil do portal — a etapa muda pelo registro, não pelo arraste)
        </span>
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => registrar({ resultado: 'falei_ok' })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
        >
          <Check size={14} aria-hidden="true" /> Falei — resolvido
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => registrar({ resultado: 'falei_pendencia' })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
        >
          <Clock size={14} aria-hidden="true" /> Falei — ficou pendência
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => registrar({ resultado: 'sem_contato' })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <PhoneOff size={14} aria-hidden="true" /> Não consegui contato
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center pt-3 border-t border-slate-100 dark:border-white/5">
        <label className="sr-only" htmlFor={`portal-action-motivo-${dealId}`}>
          Motivo da perda
        </label>
        <select
          id={`portal-action-motivo-${dealId}`}
          value={motivoSlug}
          onChange={(e) => setMotivoSlug(e.target.value)}
          disabled={busy}
          className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-xs dark:text-white outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
        >
          {MOTIVOS_PERDA.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          disabled={busy}
          placeholder="Obs (opcional)"
          aria-label="Observação da perda"
          className="min-w-0 flex-1 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-xs dark:text-white outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            registrar({
              resultado: 'perdido',
              motivo_slug: motivoSlug,
              ...(obs.trim() ? { obs: obs.trim() } : {}),
            })
          }
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-transparent border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ThumbsDown size={14} aria-hidden="true" /> Perdido
        </button>
      </div>

      {isAdmin && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
          Override manual de etapa (gestão) — ainda não disponível nesta tela.
        </p>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default PortalActionPanel;

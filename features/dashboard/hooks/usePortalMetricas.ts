'use client';

import { useQuery } from '@tanstack/react-query';

/**
 * Fetch único do miolo do portal (GET /api/portal-metricas). Todos os cards da
 * fusão (recompra, receita, positivação, …) leem deste mesmo hook — react-query
 * dedupe pela queryKey, então é UMA chamada ao route por período, não N.
 */
export interface RecompraRow {
  segmento: string;
  pct: number;
  n: number;
}

export interface CanalFechamento {
  canal: string;
  pares_emitidos: number;
  valor_emitido: number;
  pares_entregues: number;
  valor_entregue: number;
}

export interface Receita {
  periodo: { inicio: string; fim: string };
  canais: CanalFechamento[];
  total: Omit<CanalFechamento, 'canal'>;
}

export interface PilarPositivacao {
  pilar: 'retencao' | 'reativacao' | 'novo' | string;
  clientes: number;
  pares: number;
}

export interface Positivacao {
  periodo: { inicio: string; fim: string };
  escritorio: string | null;
  pilares: PilarPositivacao[];
  total: { clientes: number; pares: number };
}

export interface Intensidade {
  periodo: { inicio: string; fim: string };
  escritorio: string | null;
  valor: number;
  pares: number;
  pedidos: number;
  clientes: number;
  arpu: number;
  ticket_medio: number;
  frequencia: number;
}

export interface MesAquisicao {
  mes: string;
  novos: number;
  pares: number;
}

export interface Aquisicao {
  escritorio: string | null;
  serie: MesAquisicao[];
  ytd: { novos: number; pares: number };
  atual: MesAquisicao | null;
}

export interface PortalMetricas {
  recompra_segmento: RecompraRow[] | null;
  receita: Receita | null;
  positivacao: Positivacao | null;
  intensidade: Intensidade | null;
  aquisicao: Aquisicao | null;
}

export function usePortalMetricas(params?: { inicio?: string; fim?: string; escritorio?: string }) {
  const qs = new URLSearchParams();
  if (params?.inicio) qs.set('inicio', params.inicio);
  if (params?.fim) qs.set('fim', params.fim);
  if (params?.escritorio) qs.set('escritorio', params.escritorio);
  const suffix = qs.toString();

  return useQuery<PortalMetricas>({
    queryKey: ['portal-metricas', params?.inicio ?? '', params?.fim ?? '', params?.escritorio ?? ''],
    queryFn: async () => {
      const r = await fetch(`/api/portal-metricas${suffix ? `?${suffix}` : ''}`);
      if (!r.ok) throw new Error('falha ao buscar métricas do portal');
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

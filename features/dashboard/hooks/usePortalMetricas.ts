'use client';

import { useQuery } from '@tanstack/react-query';
import { usePortalScope } from '../context/PortalScopeContext';

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

export interface CarteiraPositivada {
  positivados: number;
  carteira: number;
  pct: number | null;
}

export interface Positivacao {
  periodo: { inicio: string; fim: string };
  escritorio: string | null;
  pilares: PilarPositivacao[];
  total: { clientes: number; pares: number };
  carteira: CarteiraPositivada | null;
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
  meta_novos: number | null;
}

export interface ForecastMes {
  mes: number;
  meta: number;
  realizado: number | null;
}

export interface Forecast {
  escritorio: string | null;
  meta_ano: number;
  meses_fechados: number;
  realizado_fechado: number;
  meta_fechado: number;
  atingimento_fechado: number | null;
  projecao_ano: number | null;
  gap_ano: number | null;
  meta_restante: number;
  esforco_restante: number | null;
  super_meta: number | null;
  esforco_super: number | null;
  serie: ForecastMes[];
}

export interface Conversao {
  periodo: { inicio: string; fim: string };
  escritorio: string | null;
  ganhos: number;
  fechados: number;
  pct: number | null;
}

export interface LtvReceita {
  escritorio: string | null;
  ltv: number;
  clientes: number;
  desde: string;
}

export interface Churn {
  periodo: { inicio: string; fim: string };
  escritorio: string | null;
  clientes: number;
  valor_12m: number;
}

export interface PortalMetricas {
  recompra_segmento: RecompraRow[] | null;
  receita: Receita | null;
  positivacao: Positivacao | null;
  intensidade: Intensidade | null;
  aquisicao: Aquisicao | null;
  forecast: Forecast | null;
  conversao: Conversao | null;
  ltv: LtvReceita | null;
  churn: Churn | null;
}

export function usePortalMetricas(params?: { inicio?: string; fim?: string; escritorio?: string | null }) {
  // foco (escritório) e janela (período): explícito > contexto > default. Um escopo, todos os cards.
  const scope = usePortalScope();
  const escritorio = params?.escritorio ?? scope.escritorio ?? undefined;
  const inicio = params?.inicio ?? scope.inicio ?? undefined;
  const fim = params?.fim ?? scope.fim ?? undefined;

  const qs = new URLSearchParams();
  if (inicio) qs.set('inicio', inicio);
  if (fim) qs.set('fim', fim);
  if (escritorio) qs.set('escritorio', escritorio);
  const suffix = qs.toString();

  return useQuery<PortalMetricas>({
    queryKey: ['portal-metricas', inicio ?? '', fim ?? '', escritorio ?? ''],
    queryFn: async () => {
      const r = await fetch(`/api/portal-metricas${suffix ? `?${suffix}` : ''}`);
      if (!r.ok) throw new Error('falha ao buscar métricas do portal');
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface EscritorioComercial {
  escritorio: string;
  pares_12m: number;
  clientes: number;
}

/** Lista de escritórios (carteira B2B viva) pro seletor de decupação. */
export function usePortalEscritorios() {
  return useQuery<{ escritorios: EscritorioComercial[] }>({
    queryKey: ['portal-escritorios'],
    queryFn: async () => {
      const r = await fetch('/api/portal-escritorios');
      if (!r.ok) throw new Error('falha ao buscar escritórios do portal');
      return r.json();
    },
    staleTime: 30 * 60 * 1000,
  });
}

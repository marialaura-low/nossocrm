import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/portal-metricas — fundação do dashboard-fusão.
 *
 * Puxa as métricas do MIOLO do portal (Supabase Macboot) via PostgREST anon,
 * pra o dashboard do Maré falar a língua da Macboot: os cards genéricos com dado
 * real + as métricas calçadistas. Fonte canônica sempre que existir (a gente CHAMA
 * o número, não recalcula) — recompra vem de `funil_baseline`, receita vem da RPC
 * `fechamento_comercial` (doutrina emissão×entrega). Só usuário autenticado consome.
 *
 * Params:
 *   ?inicio=YYYY-MM-DD&fim=YYYY-MM-DD  período da receita (default: mês corrente).
 *   ?escritorio=<nome>                 micro→macro: presente = 1 escritório (rep),
 *                                      ausente = soma (gestão). Hoje as fontes anon
 *                                      são macro; o recorte por escritório depende de
 *                                      camada per-escritório no portal (frente própria,
 *                                      casa com a Onda 2 = rep com login).
 */
async function portalGet(path: string): Promise<unknown> {
  const key = process.env.PORTAL_ANON_KEY!;
  const res = await fetch(`${process.env.PORTAL_REST_URL}${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`portal ${path} -> ${res.status}`);
  return res.json();
}

async function portalRpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const key = process.env.PORTAL_ANON_KEY!;
  const res = await fetch(`${process.env.PORTAL_REST_URL}/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`portal rpc ${fn} -> ${res.status}`);
  return res.json();
}

/** Primeiro dia do mês corrente → primeiro dia do mês seguinte (fechamento usa [inicio, fim)). */
function mesCorrente(): { inicio: string; fim: string } {
  const now = new Date();
  const iso = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { inicio: iso(now.getFullYear(), now.getMonth()), fim: iso(now.getFullYear(), now.getMonth() + 1) };
}

interface CanalFechamento {
  canal: string;
  pares_emitidos: number;
  valor_emitido: number;
  pares_entregues: number;
  valor_entregue: number;
}

function somaCanais(canais: CanalFechamento[]) {
  const round2 = (x: number) => Math.round(x * 100) / 100;
  const t = canais.reduce(
    (a, c) => ({
      pares_emitidos: a.pares_emitidos + (c.pares_emitidos || 0),
      valor_emitido: a.valor_emitido + (c.valor_emitido || 0),
      pares_entregues: a.pares_entregues + (c.pares_entregues || 0),
      valor_entregue: a.valor_entregue + (c.valor_entregue || 0),
    }),
    { pares_emitidos: 0, valor_emitido: 0, pares_entregues: 0, valor_entregue: 0 },
  );
  return { ...t, valor_emitido: round2(t.valor_emitido), valor_entregue: round2(t.valor_entregue) };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const def = mesCorrente();
  const inicio = searchParams.get('inicio') || def.inicio;
  const fim = searchParams.get('fim') || def.fim;

  // recompra ≤120d por segmento — funil_baseline (calculado no portal, migration 018)
  // receita — RPC canônica fechamento_comercial (emissão sell_in × entrega faturamento)
  const [recompraR, receitaR] = await Promise.allSettled([
    portalGet('/funil_baseline?select=segmento,janela,pct,n&order=n.desc'),
    portalRpc('fechamento_comercial', { inicio, fim }),
  ]);

  if (recompraR.status === 'rejected' && receitaR.status === 'rejected') {
    console.error('[portal-metricas] recompra:', recompraR.reason, 'receita:', receitaR.reason);
    return NextResponse.json({ error: 'erro ao buscar métricas do portal' }, { status: 502 });
  }

  let receita: { periodo: { inicio: string; fim: string }; canais: CanalFechamento[]; total: ReturnType<typeof somaCanais> } | null = null;
  if (receitaR.status === 'fulfilled') {
    const canais = receitaR.value as CanalFechamento[];
    receita = { periodo: { inicio, fim }, canais, total: somaCanais(canais) };
  } else {
    console.error('[portal-metricas] receita:', receitaR.reason);
  }

  return NextResponse.json({
    recompra_segmento: recompraR.status === 'fulfilled' ? recompraR.value : null,
    receita,
  });
}

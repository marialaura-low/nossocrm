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

interface PilarPositivacao {
  pilar: string;
  clientes: number;
  pares: number;
}

function somaPilares(pilares: PilarPositivacao[]) {
  return pilares.reduce(
    (a, p) => ({ clientes: a.clientes + (p.clientes || 0), pares: a.pares + (p.pares || 0) }),
    { clientes: 0, pares: 0 },
  );
}

interface Intensidade {
  valor: number;
  pares: number;
  pedidos: number;
  clientes: number;
  arpu: number;
  ticket_medio: number;
  frequencia: number;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const def = mesCorrente();
  const inicio = searchParams.get('inicio') || def.inicio;
  const fim = searchParams.get('fim') || def.fim;
  const escritorio = searchParams.get('escritorio'); // micro→macro: presente = 1 escritório

  // Universo comercial único = v_sell_in_canal + período (doutrina emissão × entrega).
  // recompra ≤120d por segmento — funil_baseline (macro; migration 018)
  // receita — RPC fechamento_comercial (emissão × entrega; macro, não aceita escritório ainda)
  // positivação 3 pilares + intensidade (ARPU/ticket/frequência) — RPCs com escritório: micro→macro real
  const [recompraR, receitaR, positivacaoR, intensidadeR] = await Promise.allSettled([
    portalGet('/funil_baseline?select=segmento,janela,pct,n&order=n.desc'),
    portalRpc('fechamento_comercial', { inicio, fim }),
    portalRpc('positivacao_mensal', { inicio, fim, p_escritorio: escritorio }),
    portalRpc('intensidade_compra_mensal', { inicio, fim, p_escritorio: escritorio }),
  ]);

  if (
    recompraR.status === 'rejected' && receitaR.status === 'rejected' &&
    positivacaoR.status === 'rejected' && intensidadeR.status === 'rejected'
  ) {
    console.error('[portal-metricas] tudo falhou:', recompraR.reason, receitaR.reason, positivacaoR.reason, intensidadeR.reason);
    return NextResponse.json({ error: 'erro ao buscar métricas do portal' }, { status: 502 });
  }

  let receita: { periodo: { inicio: string; fim: string }; canais: CanalFechamento[]; total: ReturnType<typeof somaCanais> } | null = null;
  if (receitaR.status === 'fulfilled') {
    const canais = receitaR.value as CanalFechamento[];
    receita = { periodo: { inicio, fim }, canais, total: somaCanais(canais) };
  } else {
    console.error('[portal-metricas] receita:', receitaR.reason);
  }

  let positivacao: { periodo: { inicio: string; fim: string }; escritorio: string | null; pilares: PilarPositivacao[]; total: ReturnType<typeof somaPilares> } | null = null;
  if (positivacaoR.status === 'fulfilled') {
    const pilares = positivacaoR.value as PilarPositivacao[];
    positivacao = { periodo: { inicio, fim }, escritorio, pilares, total: somaPilares(pilares) };
  } else {
    console.error('[portal-metricas] positivacao:', positivacaoR.reason);
  }

  let intensidade: (Intensidade & { periodo: { inicio: string; fim: string }; escritorio: string | null }) | null = null;
  if (intensidadeR.status === 'fulfilled') {
    const row = (intensidadeR.value as Intensidade[])[0];
    if (row) intensidade = { ...row, periodo: { inicio, fim }, escritorio };
  } else {
    console.error('[portal-metricas] intensidade:', intensidadeR.reason);
  }

  return NextResponse.json({
    recompra_segmento: recompraR.status === 'fulfilled' ? recompraR.value : null,
    receita,
    positivacao,
    intensidade,
  });
}

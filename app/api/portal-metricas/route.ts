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

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Lê as metas editáveis do próprio Maré (tabela `metas`) → { indicador: meta_ano }. Macro = escritorio ''. */
async function lerMetas(supabase: any, ano: number, escritorio: string | null): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase
      .from('metas')
      .select('indicador, meta_ano')
      .eq('ano', ano)
      .eq('escritorio', escritorio ?? '');
    if (error || !data) return {};
    return Object.fromEntries((data as { indicador: string; meta_ano: number }[]).map((r) => [r.indicador, Number(r.meta_ano)]));
  } catch {
    return {};
  }
}

/** Curva mensal de meta (tabela `metas_mensais` do Maré) → { mes(1-12): meta }. */
async function lerMetasMensais(supabase: any, ano: number, indicador: string, escritorio: string | null): Promise<Record<number, number>> {
  try {
    const { data, error } = await supabase
      .from('metas_mensais')
      .select('mes, meta')
      .eq('ano', ano)
      .eq('indicador', indicador)
      .eq('escritorio', escritorio ?? '');
    if (error || !data) return {};
    return Object.fromEntries((data as { mes: number; meta: number }[]).map((r) => [Number(r.mes), Number(r.meta)]));
  } catch {
    return {};
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface MesRealizado { mes: string; pares: number; valor: number }

/**
 * Forecast B2B: pacing vs plano. O ritmo sai dos meses FECHADOS (exclui o corrente,
 * que é parcial) — atingimento = realizado/meta dos meses fechados — e projeta o ano
 * por RAZÃO (respeita a sazonalidade da curva, não extrapola linear). null se não há curva.
 */
function montaForecast(escritorio: string | null, curva: Record<number, number>, realizado: MesRealizado[], mesAtual: number) {
  if (Object.keys(curva).length === 0) return null;
  const real = new Map(realizado.map((r) => [Number(r.mes.slice(5, 7)), r.pares]));
  const serie: { mes: number; meta: number; realizado: number | null }[] = [];
  let realFech = 0;
  let metaFech = 0;
  for (let m = 1; m <= 12; m++) {
    const meta = curva[m] ?? 0;
    const realizadoMes = m <= mesAtual ? (real.get(m) ?? 0) : null;
    serie.push({ mes: m, meta, realizado: realizadoMes });
    if (m < mesAtual) { realFech += real.get(m) ?? 0; metaFech += meta; }
  }
  const metaAno = Object.values(curva).reduce((a, b) => a + b, 0);
  const atingimento = metaFech > 0 ? realFech / metaFech : null;
  const projecaoAno = atingimento != null ? Math.round(metaAno * atingimento) : null;
  return {
    escritorio,
    meta_ano: metaAno,
    meses_fechados: mesAtual - 1,
    realizado_fechado: realFech,
    meta_fechado: metaFech,
    atingimento_fechado: atingimento != null ? Math.round(atingimento * 1000) / 1000 : null,
    projecao_ano: projecaoAno,
    gap_ano: projecaoAno != null ? projecaoAno - metaAno : null,
    serie,
  };
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

interface MesAquisicao {
  mes: string;
  novos: number;
  pares: number;
}

function somaAquisicao(serie: MesAquisicao[]) {
  return serie.reduce(
    (a, m) => ({ novos: a.novos + (m.novos || 0), pares: a.pares + (m.pares || 0) }),
    { novos: 0, pares: 0 },
  );
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
  const mesesAno = new Date().getMonth() + 1; // meses de jan até o corrente (série = YTD)

  // Universo comercial único = v_sell_in_canal + período (doutrina emissão × entrega).
  // recompra ≤120d por segmento — funil_baseline (macro; migration 018)
  // receita — RPC fechamento_comercial (emissão × entrega; macro, não aceita escritório ainda)
  // positivação 3 pilares + intensidade (ARPU/ticket/frequência) — RPCs com escritório: micro→macro real
  const ano = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1; // 1-12
  const [portalResults, metas, curvaB2B] = await Promise.all([
    Promise.allSettled([
      portalGet('/funil_baseline?select=segmento,janela,pct,n&order=n.desc'),
      portalRpc('fechamento_comercial', { inicio, fim }),
      portalRpc('positivacao_mensal', { inicio, fim, p_escritorio: escritorio }),
      portalRpc('intensidade_compra_mensal', { inicio, fim, p_escritorio: escritorio }),
      portalRpc('aquisicao_mensal', { meses: mesesAno, p_escritorio: escritorio }),
      portalRpc('emissao_mensal_b2b', { p_escritorio: escritorio }),
    ]),
    lerMetas(supabase, ano, escritorio),
    lerMetasMensais(supabase, ano, 'pares_b2b', escritorio),
  ]);
  const [recompraR, receitaR, positivacaoR, intensidadeR, aquisicaoR, emissaoB2BR] = portalResults;

  if (
    recompraR.status === 'rejected' && receitaR.status === 'rejected' &&
    positivacaoR.status === 'rejected' && intensidadeR.status === 'rejected' &&
    aquisicaoR.status === 'rejected'
  ) {
    console.error('[portal-metricas] tudo falhou:', recompraR.reason, receitaR.reason, positivacaoR.reason, intensidadeR.reason, aquisicaoR.reason);
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

  let aquisicao: { escritorio: string | null; serie: MesAquisicao[]; ytd: ReturnType<typeof somaAquisicao>; atual: MesAquisicao | null; meta_novos: number | null } | null = null;
  if (aquisicaoR.status === 'fulfilled') {
    const serie = aquisicaoR.value as MesAquisicao[];
    aquisicao = {
      escritorio, serie, ytd: somaAquisicao(serie),
      atual: serie.length ? serie[serie.length - 1] : null,
      meta_novos: metas.novos ?? null, // da tabela editável do Maré; null = não cadastrada (não fabrica)
    };
  } else {
    console.error('[portal-metricas] aquisicao:', aquisicaoR.reason);
  }

  const realizadoB2B = emissaoB2BR.status === 'fulfilled' ? (emissaoB2BR.value as MesRealizado[]) : [];
  if (emissaoB2BR.status === 'rejected') console.error('[portal-metricas] emissao_b2b:', emissaoB2BR.reason);
  const forecast = montaForecast(escritorio, curvaB2B, realizadoB2B, mesAtual);

  return NextResponse.json({
    recompra_segmento: recompraR.status === 'fulfilled' ? recompraR.value : null,
    receita,
    positivacao,
    intensidade,
    aquisicao,
    forecast,
  });
}

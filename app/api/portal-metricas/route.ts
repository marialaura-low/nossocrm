import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { portalGet, portalRpc } from '@/lib/portal/rest';

// Dado vivo: sem data-cache do Next nos fetches do handler (o GET do supabase-js
// às metas era cacheado e segurava curva antiga). O caching fica no cliente (react-query 5min).
export const fetchCache = 'force-no-store';
export const dynamic = 'force-dynamic';

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
 *                                      ausente = soma (gestão). A maioria das RPCs
 *                                      recorta por escritório; recompra (funil_baseline)
 *                                      segue macro (baseline pré-computado).
 */

/** Lê as metas editáveis do próprio Maré (tabela `metas`) → { indicador: { meta, obs } }. Macro = escritorio ''. */
async function lerMetas(supabase: any, ano: number, escritorio: string | null): Promise<Record<string, { meta: number; obs: string | null }>> {
  try {
    const { data, error } = await supabase
      .from('metas')
      .select('indicador, meta_ano, obs')
      .eq('ano', ano)
      .eq('escritorio', escritorio ?? '');
    if (error || !data) return {};
    return Object.fromEntries(
      (data as { indicador: string; meta_ano: number; obs?: string | null }[])
        .map((r) => [r.indicador, { meta: Number(r.meta_ano), obs: r.obs ?? null }]),
    );
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

interface MesRealizado { mes: string; pares: number; valor: number }

/**
 * Forecast B2B: pacing vs plano. O ritmo sai dos meses FECHADOS (exclui o corrente,
 * que é parcial) — atingimento = realizado/meta dos meses fechados — e projeta o ano
 * por RAZÃO (respeita a sazonalidade da curva, não extrapola linear). null se não há curva.
 *
 * Três camadas de leitura (decisão Low 14/07):
 *   meta      = o compromisso (não muda com o ritmo);
 *   tendência = onde o ano fecha SE o ritmo continuar (projecao_ano);
 *   esforço   = o que os meses restantes (corrente incluso) precisam rodar vs o
 *               plano deles pra ainda bater a meta — a linha de AÇÃO do card.
 * super_meta (opcional, tabela metas do Maré): alvo esticado acima do compromisso.
 */
function montaForecast(
  escritorio: string | null,
  curva: Record<number, number>,
  realizado: MesRealizado[],
  mesAtual: number,
  superMeta: number | null = null,
) {
  if (Object.keys(curva).length === 0) return null;
  const real = new Map(realizado.map((r) => [Number(r.mes.slice(5, 7)), r.pares]));
  const serie: { mes: number; meta: number; realizado: number | null }[] = [];
  let realFech = 0;
  let metaFech = 0;
  let metaRestante = 0; // plano dos meses ainda em jogo (corrente incluso — ele ainda entrega)
  for (let m = 1; m <= 12; m++) {
    const meta = curva[m] ?? 0;
    const realizadoMes = m <= mesAtual ? (real.get(m) ?? 0) : null;
    serie.push({ mes: m, meta, realizado: realizadoMes });
    if (m < mesAtual) { realFech += real.get(m) ?? 0; metaFech += meta; }
    else metaRestante += meta;
  }
  const metaAno = Object.values(curva).reduce((a, b) => a + b, 0);
  const atingimento = metaFech > 0 ? realFech / metaFech : null;
  const projecaoAno = atingimento != null ? Math.round(metaAno * atingimento) : null;
  const esforco = (alvo: number) =>
    metaRestante > 0 ? Math.round(((alvo - realFech) / metaRestante) * 1000) / 1000 : null;
  return {
    escritorio,
    meta_ano: metaAno,
    meses_fechados: mesAtual - 1,
    realizado_fechado: realFech,
    meta_fechado: metaFech,
    atingimento_fechado: atingimento != null ? Math.round(atingimento * 1000) / 1000 : null,
    projecao_ano: projecaoAno,
    gap_ano: projecaoAno != null ? projecaoAno - metaAno : null,
    meta_restante: metaRestante,
    esforco_restante: esforco(metaAno),
    super_meta: superMeta,
    esforco_super: superMeta != null ? esforco(superMeta) : null,
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
  // Receita micro→macro: com escritório usa a função irmã (reconcilia com o macro);
  // sem escritório usa a canônica (mesma fonte única dos outros agentes).
  const receitaCall = escritorio
    ? portalRpc('fechamento_comercial_escritorio', { inicio, fim, p_escritorio: escritorio })
    : portalRpc('fechamento_comercial', { inicio, fim });
  const [portalResults, metas, curvaB2B] = await Promise.all([
    Promise.allSettled([
      portalGet('/funil_baseline?select=segmento,janela,pct,n&order=n.desc'),
      receitaCall,
      portalRpc('positivacao_mensal', { inicio, fim, p_escritorio: escritorio }),
      portalRpc('intensidade_compra_mensal', { inicio, fim, p_escritorio: escritorio }),
      portalRpc('aquisicao_mensal', { meses: mesesAno, p_escritorio: escritorio }),
      portalRpc('emissao_mensal_b2b', { p_escritorio: escritorio }),
      portalRpc('conversao_funil', { inicio, fim, p_escritorio: escritorio }),
      portalRpc('ltv_receita', { p_escritorio: escritorio }),
      portalRpc('churn_clientes', { inicio, fim, p_escritorio: escritorio }),
      portalRpc('carteira_positivada', { inicio, fim, p_escritorio: escritorio }),
    ]),
    lerMetas(supabase, ano, escritorio),
    lerMetasMensais(supabase, ano, 'pares_b2b', escritorio),
  ]);
  const [recompraR, receitaR, positivacaoR, intensidadeR, aquisicaoR, emissaoB2BR, conversaoR, ltvR, churnR, carteiraR] = portalResults;

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

  // % da carteira positivada (RPC carteira_positivada) — enriquece o card de positivação
  let carteira: { positivados: number; carteira: number; pct: number | null } | null = null;
  if (carteiraR.status === 'fulfilled') {
    carteira = (carteiraR.value as { positivados: number; carteira: number; pct: number | null }[])[0] ?? null;
  } else {
    console.error('[portal-metricas] carteira:', carteiraR.reason);
  }

  let positivacao: { periodo: { inicio: string; fim: string }; escritorio: string | null; pilares: PilarPositivacao[]; total: ReturnType<typeof somaPilares>; carteira: typeof carteira } | null = null;
  if (positivacaoR.status === 'fulfilled') {
    const pilares = positivacaoR.value as PilarPositivacao[];
    positivacao = { periodo: { inicio, fim }, escritorio, pilares, total: somaPilares(pilares), carteira };
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
      meta_novos: metas.novos?.meta ?? null, // da tabela editável do Maré; null = não cadastrada (não fabrica)
    };
  } else {
    console.error('[portal-metricas] aquisicao:', aquisicaoR.reason);
  }

  const realizadoB2B = emissaoB2BR.status === 'fulfilled' ? (emissaoB2BR.value as MesRealizado[]) : [];
  if (emissaoB2BR.status === 'rejected') console.error('[portal-metricas] emissao_b2b:', emissaoB2BR.reason);
  // super meta (opcional, editável): alvo esticado acima do compromisso — só aparece se cadastrada.
  // obs (ex.: "em validação") vive no banco: validar/limpar não exige deploy.
  const forecastBase = montaForecast(escritorio, curvaB2B, realizadoB2B, mesAtual, metas.super_pares_b2b?.meta ?? null);
  const forecast = forecastBase ? { ...forecastBase, super_meta_obs: metas.super_pares_b2b?.obs ?? null } : null;

  // conversão do funil (RPC retorna 1 linha) — caveat: 'encerrado' pré-trigger tem ruído de ciclo de vida
  let conversao: { periodo: { inicio: string; fim: string }; escritorio: string | null; ganhos: number; fechados: number; pct: number | null } | null = null;
  if (conversaoR.status === 'fulfilled') {
    const row = (conversaoR.value as { ganhos: number; fechados: number; pct: number | null }[])[0];
    if (row) conversao = { periodo: { inicio, fim }, escritorio, ...row };
  } else {
    console.error('[portal-metricas] conversao:', conversaoR.reason);
  }

  // Churn: quem cruzou a linha dos 120d sem comprar DENTRO do período (espelho da reativação)
  let churn: { periodo: { inicio: string; fim: string }; escritorio: string | null; clientes: number; valor_12m: number } | null = null;
  if (churnR.status === 'fulfilled') {
    const row = (churnR.value as { clientes: number; valor_12m: number }[])[0];
    if (row) churn = { periodo: { inicio, fim }, escritorio, ...row };
  } else {
    console.error('[portal-metricas] churn:', churnR.reason);
  }

  // LTV-receita (vida no banco, desde 2023) — receita, não margem (margem trava em custo/par)
  let ltv: { escritorio: string | null; ltv: number; clientes: number; desde: string } | null = null;
  if (ltvR.status === 'fulfilled') {
    const row = (ltvR.value as { ltv: number; clientes: number; desde: string }[])[0];
    if (row) ltv = { escritorio, ...row };
  } else {
    console.error('[portal-metricas] ltv:', ltvR.reason);
  }

  return NextResponse.json({
    recompra_segmento: recompraR.status === 'fulfilled' ? recompraR.value : null,
    receita,
    positivacao,
    intensidade,
    aquisicao,
    forecast,
    conversao,
    ltv,
    churn,
  });
}

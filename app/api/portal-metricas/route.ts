import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/portal-metricas — fundação do dashboard-fusão.
 *
 * Puxa as métricas do MIOLO do portal (Supabase Macboot) via PostgREST anon,
 * pra o dashboard do Maré falar a língua da Macboot: os cards genéricos com dado
 * real + as métricas calçadistas. Começa pela recompra por segmento (a de ouro,
 * já calculada em `funil_baseline`); os demais cards entram aqui incrementalmente.
 * Só usuário autenticado do Maré consome.
 */
async function portalGet(path: string): Promise<unknown> {
  const key = process.env.PORTAL_ANON_KEY!;
  const res = await fetch(`${process.env.PORTAL_REST_URL}${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`portal ${path} -> ${res.status}`);
  return res.json();
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  try {
    // recompra ≤120d por segmento — funil_baseline (calculado no portal, migration 018)
    const recompra_segmento = await portalGet('/funil_baseline?select=segmento,janela,pct,n&order=n.desc');
    return NextResponse.json({ recompra_segmento });
  } catch (error) {
    console.error('[portal-metricas]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'erro ao buscar métricas do portal' }, { status: 502 });
  }
}

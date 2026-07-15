import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { portalRpc } from '@/lib/portal/rest';

/**
 * GET /api/portal-escritorios — lista de escritórios comerciais (carteira B2B viva, 12m),
 * do MIOLO do portal, pra alimentar o seletor de decupação micro→macro do dashboard.
 * Ordenados por volume. Só usuário autenticado consome.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  try {
    const escritorios = await portalRpc('escritorios_comerciais', {});
    return NextResponse.json({ escritorios });
  } catch (error) {
    console.error('[portal-escritorios]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'erro ao buscar escritórios do portal' }, { status: 502 });
  }
}

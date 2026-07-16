import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Dado vivo (mesma razão do portal-metricas): sem data-cache do Next; o caching é do cliente.
export const fetchCache = 'force-no-store';

/**
 * GET /api/portal-ficha?matriz=X&escritorio=Y — ficha rica do Maré (item A da união).
 *
 * A gestão abre um deal-espelho no Maré e vê o MIOLO do portal daquele cliente:
 * histórico de pedidos COM loja (v12), ritmo, pedido na casa, segmento, jornada,
 * última anotação. Read-only (spec união §4.1: espelho não se edita; nota vai pro portal).
 *
 * Auth em duas pontas: usuário autenticado do Maré aqui; token do rep ADMIN (header,
 * nunca URL) na edge portal-cliente v13, que exige escritório EXPLÍCITO no caminho admin.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const matriz = searchParams.get('matriz');
  const escritorio = searchParams.get('escritorio');
  if (!matriz || !escritorio) {
    return NextResponse.json({ error: 'matriz e escritorio são obrigatórios' }, { status: 400 });
  }

  try {
    const base = process.env.PORTAL_REST_URL!.replace('/rest/v1', '/functions/v1/portal-cliente');
    const qs = new URLSearchParams({ cnpj: matriz, escritorio });
    const res = await fetch(`${base}?${qs}`, {
      headers: { 'x-portal-token': process.env.PORTAL_FUNIL_TOKEN! },
    });
    if (!res.ok) {
      console.error('[portal-ficha] edge portal-cliente ->', res.status);
      return NextResponse.json({ error: 'erro ao buscar a ficha no portal' }, { status: 502 });
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error('[portal-ficha]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'erro ao buscar a ficha no portal' }, { status: 502 });
  }
}

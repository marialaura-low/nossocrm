/**
 * Acesso ao MIOLO do portal (Supabase Macboot) via PostgREST anon.
 * PORTAL_REST_URL/PORTAL_ANON_KEY vivem no .env.local. Compartilhado pelas rotas
 * do dashboard-fusão (portal-metricas, portal-escritorios) pra não haver duas cópias.
 */
export async function portalGet(path: string): Promise<unknown> {
  const key = process.env.PORTAL_ANON_KEY!;
  const res = await fetch(`${process.env.PORTAL_REST_URL}${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`portal ${path} -> ${res.status}`);
  return res.json();
}

export async function portalRpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const key = process.env.PORTAL_ANON_KEY!;
  const res = await fetch(`${process.env.PORTAL_REST_URL}/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`portal rpc ${fn} -> ${res.status}`);
  return res.json();
}

// lib/inbound/conflito.ts
import type { Conflito } from './types';

export async function checkConflito(cnpjDigits: string): Promise<Conflito> {
  const none: Conflito = { jaCliente: false, escritorio: null, ultimoPedido: null };
  const cnpj = (cnpjDigits || '').replace(/\D/g, '');
  const base = process.env.PORTAL_REST_URL;
  const token = process.env.PORTAL_FUNIL_TOKEN;
  if (!cnpj || !base || !token) return none;

  const url = base.replace('/rest/v1', '/functions/v1/portal-cliente')
    + `?matriz=${encodeURIComponent(cnpj)}`;
  let resp: Response;
  try {
    resp = await fetch(url, { headers: { 'x-portal-token': token } });
  } catch {
    return none;
  }
  if (!resp.ok) return none;
  const d = await resp.json();
  const pedidos: Array<{ data?: string }> = Array.isArray(d?.pedidos) ? d.pedidos : [];
  if (pedidos.length === 0) return none;

  const datas = pedidos.map((p) => p.data).filter(Boolean).sort();
  return {
    jaCliente: true,
    escritorio: d?.escritorio ?? null,
    ultimoPedido: datas.length ? (datas[datas.length - 1] as string) : null,
  };
}

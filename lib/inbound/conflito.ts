// lib/inbound/conflito.ts
import { portalGet } from '@/lib/portal/rest';
import type { Conflito } from './types';

// "Já é cliente?" — lookup GLOBAL por CNPJ na faturamento do portal (read-only).
// Não usa a edge portal-cliente (que exige escritorio, inexistente pra lead novo).
export async function checkConflito(cnpjDigits: string): Promise<Conflito> {
  const none: Conflito = { jaCliente: false, escritorio: null, ultimoPedido: null };
  const cnpj = (cnpjDigits || '').replace(/\D/g, '');
  if (cnpj.length !== 14) return none;

  let rows: unknown;
  try {
    rows = await portalGet(
      `/faturamento?cnpj=eq.${cnpj}&select=escritorio,data_nf&order=data_nf.desc&limit=1`,
    );
  } catch {
    return none; // fail-safe: portal fora não derruba o funil
  }
  if (!Array.isArray(rows) || rows.length === 0) return none;

  const top = rows[0] as { escritorio?: string | null; data_nf?: string | null };
  return {
    jaCliente: true,
    escritorio: top.escritorio ?? null,
    ultimoPedido: top.data_nf ?? null,
  };
}

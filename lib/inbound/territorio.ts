// lib/inbound/territorio.ts
import { portalGet } from '@/lib/portal/rest';
import type { Territorio } from './types';

// Território por CIDADE/UF: lê o mapa derivado `territorio_cidade` no portal (read-only, anon).
// Sinaliza (casa / rep externo dono / disputa), NUNCA bloqueia — rep segue segurado nesta fase.
const NONE: Territorio = { mapeado: false, repDominante: null, disputado: false, coberturaCasa: false, responsavelCobertura: null };

// Casa=UPPER sem acento, espaços colapsados — mesma forma das chaves do mapa (faturamento é UPPER sem acento).
function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

export async function checkTerritorio(cidadeRaw?: string | null, ufRaw?: string | null): Promise<Territorio> {
  const cidade = norm(cidadeRaw || '');
  const uf = norm(ufRaw || '');
  if (!cidade || !uf) return NONE;

  let rows: unknown;
  try {
    rows = await portalGet(
      `/territorio_cidade?cidade=eq.${encodeURIComponent(cidade)}&uf=eq.${encodeURIComponent(uf)}` +
      `&select=rep_dominante,disputado,cobertura_casa,responsavel_cobertura&limit=1`,
    );
  } catch {
    return NONE; // fail-safe: portal fora não derruba o funil (idem conflito)
  }
  if (!Array.isArray(rows) || rows.length === 0) return NONE;

  const t = rows[0] as { rep_dominante?: string | null; disputado?: boolean; cobertura_casa?: boolean; responsavel_cobertura?: string | null };
  return {
    mapeado: true,
    repDominante: t.rep_dominante ?? null,
    disputado: !!t.disputado,
    coberturaCasa: !!t.cobertura_casa,
    responsavelCobertura: t.responsavel_cobertura ?? null,
  };
}

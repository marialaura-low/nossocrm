// lib/inbound/territorio.ts
import { portalGet } from '@/lib/portal/rest';
import type { Territorio } from './types';

// Território por CIDADE/UF: lê o mapa derivado `territorio_cidade` no portal (read-only, anon).
// Sinaliza (casa / rep externo dono / disputa), NUNCA bloqueia — rep segue segurado nesta fase.
const NONE: Territorio = { mapeado: false, casa: false, responsavelCasa: null, repDominante: null, disputado: false };

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
      `&select=casa,responsavel_casa,rep_dominante,disputado&limit=1`,
    );
  } catch {
    return NONE; // fail-safe: portal fora não derruba o funil (idem conflito)
  }
  if (!Array.isArray(rows) || rows.length === 0) return NONE;

  const t = rows[0] as { casa?: boolean; responsavel_casa?: string | null; rep_dominante?: string | null; disputado?: boolean };
  return {
    mapeado: true,
    casa: !!t.casa,
    responsavelCasa: t.responsavel_casa ?? null,
    repDominante: t.rep_dominante ?? null,
    disputado: !!t.disputado,
  };
}

// lib/inbound/cnpj.ts
import type { PorteSinal } from './types';

const FIT_KEYWORDS = [
  'caça', 'caca', 'pesca', 'camping', 'esportiv', 'artigos esportivos',
  'náutic', 'nautic', 'outdoor', 'agropecuár', 'agropecuar', 'agro',
  'calçad', 'calcad', 'vestuário', 'vestuario', 'militar', 'tático', 'tatico',
];

function normaliza(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export async function enrichCnpj(cnpjDigits: string): Promise<PorteSinal> {
  const empty: PorteSinal = {
    razaoSocial: null, nomeFantasia: null, cnaePrincipal: null, cnaeDescricao: null,
    capitalSocial: null, dataInicioAtividade: null, nFiliais: null,
    fitSortimento: false, cnpjValido: false,
  };
  const cnpj = (cnpjDigits || '').replace(/\D/g, '');
  if (cnpj.length !== 14) return empty;

  let resp: Response;
  try {
    resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  } catch {
    return empty;
  }
  if (!resp.ok) return empty;
  const d = await resp.json();

  const desc: string = d.cnae_fiscal_descricao || '';
  const descNorm = normaliza(desc);
  const secundarios: string[] = (d.cnaes_secundarios || []).map((c: { descricao?: string }) => normaliza(c.descricao || ''));
  const fit = [descNorm, ...secundarios].some((t) => FIT_KEYWORDS.some((k) => t.includes(normaliza(k))));

  return {
    razaoSocial: d.razao_social ?? null,
    nomeFantasia: d.nome_fantasia ?? null,
    cnaePrincipal: d.cnae_fiscal != null ? String(d.cnae_fiscal) : null,
    cnaeDescricao: desc || null,
    capitalSocial: typeof d.capital_social === 'number' ? d.capital_social : null,
    dataInicioAtividade: d.data_inicio_atividade ?? null,
    nFiliais: null,
    fitSortimento: fit,
    cnpjValido: true,
  };
}

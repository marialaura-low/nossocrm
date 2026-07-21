// lib/inbound/types.ts
// Sinal de porte inferido do CNPJ — NUNCA perguntado ao lead.
export interface PorteSinal {
  razaoSocial: string | null;
  nomeFantasia: string | null;
  cnaePrincipal: string | null;      // código
  cnaeDescricao: string | null;      // texto
  capitalSocial: number | null;
  dataInicioAtividade: string | null; // ISO
  nFiliais: number | null;
  fitSortimento: boolean;            // CNAE bate caça/pesca/outdoor/agro/calçado/esporte
  cnpjValido: boolean;
}

export interface Conflito {
  jaCliente: boolean;
  escritorio: string | null;   // rep dono, se já cliente
  ultimoPedido: string | null; // data ISO do último pedido, se houver
}

// Sinal de território por CIDADE/UF (mapa derivado no portal: territorio_cidade).
// Complementa o Conflito (que é por CNPJ): mesmo lead novo pode cair em praça de rep.
export interface Territorio {
  mapeado: boolean;             // achou a cidade no mapa (false = praça sem cobertura conhecida)
  repDominante: string | null;  // rep EXTERNO dono da praça (por pares recentes; REP GO conta) — munição, não bloqueia
  disputado: boolean;           // >=2 reps externos relevantes na mesma cidade
  coberturaCasa: boolean;       // Tiago/Simone já cobrem a praça (força-tarefa na carteira do REP GO)
  responsavelCobertura: string | null; // Tiago/Simone, se houver cobertura da casa
}

// Payload que o GPT Maker manda ao qualificar um lojista.
export interface LeadInbound {
  nomeLoja: string;
  cidade: string;
  uf: string;
  cnpj: string;              // só dígitos
  sortimento: string;        // resposta livre (caça/pesca/agro/…)
  marcas: string;            // marcas que já trabalha (texto livre)
  contatoNome: string;
  contatoWhatsapp: string;
  transcript: string;        // conversa inteira
  adReferral: string | null; // qual anúncio/criativo trouxe (campo referral do CTWA)
}

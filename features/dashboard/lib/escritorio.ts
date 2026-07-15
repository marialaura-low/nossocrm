/**
 * Encurta o nome do escritório pra exibição (o valor cru vira o filtro; o rótulo é limpo).
 * "REP GO REPRESENTACAO COMERCIAL LTDA" → "REP GO". Nunca some com o nome inteiro:
 * se o corte deixar coisa curta demais, mantém o original.
 */
export function nomeEscritorio(bruto: string): string {
  const corte = bruto
    .replace(/\s+(REPRESENTAC\w*|COMERCIO|COMERCIA\w*|SERVICOS?|ARTIGOS?|DE CALCADOS?|LTDA|EIRELI|EPP|-?\s*ME)\b.*$/i, '')
    .trim();
  return corte.length >= 3 ? corte : bruto;
}

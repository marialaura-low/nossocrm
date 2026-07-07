// Formatação de moeda em Real (pt-BR). Fonte única pra não espalhar `$` chumbado.

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});

/** Formata um número como R$ 1.234,56. */
export function formatBRL(value: number | null | undefined): string {
  return BRL.format(Number(value) || 0);
}

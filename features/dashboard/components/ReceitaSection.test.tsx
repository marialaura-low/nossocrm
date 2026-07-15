import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReceitaSection } from './ReceitaSection';

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ReceitaSection />
    </QueryClientProvider>
  );
}

const receita = {
  periodo: { inicio: '2026-06-01', fim: '2026-07-01' },
  canais: [
    { canal: 'B2B', pares_emitidos: 14807, valor_emitido: 2942727.63, pares_entregues: 14441, valor_entregue: 2720254.64 },
    { canal: 'E-commerce (fabrica)', pares_emitidos: 2086, valor_emitido: 439832.92, pares_entregues: 0, valor_entregue: 0 },
    { canal: 'Exportacao', pares_emitidos: 516, valor_emitido: 18162.36, pares_entregues: 0, valor_entregue: 0 },
  ],
  total: { pares_emitidos: 17409, valor_emitido: 3400722.91, pares_entregues: 14441, valor_entregue: 2720254.64 },
};

describe('ReceitaSection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mostra os DOIS cards — emissão (sell_in) e entrega (faturamento) — com valor e pares reais', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ receita }) })));
    renderIt();

    // doutrina emissão × entrega: dois valores distintos, não um só
    await waitFor(() => expect(screen.getByText(/3\.400\.722,91/)).toBeInTheDocument()); // emitido (total)
    expect(screen.getAllByText(/2\.720\.254,64/).length).toBeGreaterThan(0); // entregue (card + linha B2B)
    expect(screen.getByText('Emissão')).toBeInTheDocument();
    expect(screen.getByText('Entrega')).toBeInTheDocument();
    // pares somados aparecem
    expect(screen.getByText(/17\.409/)).toBeInTheDocument();
    // quebra por canal
    expect(screen.getByText('B2B')).toBeInTheDocument();
    expect(screen.getByText('Exportacao')).toBeInTheDocument();
  });

  it('não quebra o dashboard quando a receita vem nula (fonte fora)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ receita: null }) })));
    renderIt();
    await waitFor(() => expect(screen.getByText(/sem dado de receita/i)).toBeInTheDocument());
  });
});

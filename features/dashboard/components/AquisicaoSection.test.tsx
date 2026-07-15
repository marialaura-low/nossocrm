import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AquisicaoSection } from './AquisicaoSection';

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AquisicaoSection />
    </QueryClientProvider>
  );
}

const aquisicao = {
  escritorio: null,
  serie: [
    { mes: '2026-05-01', novos: 21, pares: 1167 },
    { mes: '2026-06-01', novos: 19, pares: 995 },
    { mes: '2026-07-01', novos: 7, pares: 290 },
  ],
  ytd: { novos: 47, pares: 2452 },
  atual: { mes: '2026-07-01', novos: 7, pares: 290 },
};

describe('AquisicaoSection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mostra novos do mês + acumulado no ano + série mensal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ aquisicao }) })));
    renderIt();

    // novos do mês atual (headline + barra de julho)
    await waitFor(() => expect(screen.getAllByText('7').length).toBeGreaterThanOrEqual(1));
    // acumulado no ano (único)
    expect(screen.getByText(/47/)).toBeInTheDocument();
    // rótulo de mês da série (mai/jun/jul)
    expect(screen.getAllByText(/jul/i).length).toBeGreaterThan(0);
  });

  it('não quebra quando a aquisição vem nula', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ aquisicao: null }) })));
    renderIt();
    await waitFor(() => expect(screen.getByText(/sem dado de aquisição/i)).toBeInTheDocument());
  });
});

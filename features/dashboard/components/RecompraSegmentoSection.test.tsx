import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecompraSegmentoSection } from './RecompraSegmentoSection';

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RecompraSegmentoSection />
    </QueryClientProvider>
  );
}

describe('RecompraSegmentoSection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mostra a recompra por segmento vinda do portal (labels + total destacado)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          recompra_segmento: [
            { segmento: 'rede', pct: 56.0, n: 425 },
            { segmento: 'loja_independente', pct: 19.7, n: 1094 },
            { segmento: 'TOTAL', pct: 35.0, n: 1705 },
          ],
        }),
      }))
    );

    renderIt();

    await waitFor(() => expect(screen.getByText('Rede')).toBeInTheDocument());
    expect(screen.getByText('Loja independente')).toBeInTheDocument();
    expect(screen.getByText(/1094 clientes/)).toBeInTheDocument();
    expect(screen.getByText('Total da carteira')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument();
  });

  it('mostra erro quando a rota falha, sem quebrar o dashboard', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })));
    renderIt();
    await waitFor(() => expect(screen.getByText(/Não consegui puxar do portal/)).toBeInTheDocument());
  });
});

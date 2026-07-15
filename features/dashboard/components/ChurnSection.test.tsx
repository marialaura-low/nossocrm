import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChurnSection } from './ChurnSection';

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ChurnSection />
    </QueryClientProvider>
  );
}

const churn = {
  periodo: { inicio: '2026-07-01', fim: '2026-08-01' },
  escritorio: null,
  clientes: 81,
  valor_12m: 2350595.6,
};

describe('ChurnSection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mostra quem esfriou no período e o sell-in 12m em risco', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ churn }) })));
    renderIt();

    await waitFor(() => expect(screen.getByText('81')).toBeInTheDocument());
    expect(screen.getByText('Esfriamento')).toBeInTheDocument();
    expect(screen.getByText(/2\.350\.595,60/)).toBeInTheDocument();
    expect(screen.getByText(/sell-in 12m em risco/)).toBeInTheDocument();
    // amarração com o funil: esfriou → fila de reativação
    expect(screen.getByText(/fila de reativação/)).toBeInTheDocument();
  });

  it('não quebra quando o churn vem nulo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ churn: null }) })));
    renderIt();
    await waitFor(() => expect(screen.getByText(/sem dado de esfriamento/i)).toBeInTheDocument());
  });
});

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PositivacaoSection } from './PositivacaoSection';

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PositivacaoSection />
    </QueryClientProvider>
  );
}

const positivacao = {
  periodo: { inicio: '2026-06-01', fim: '2026-07-01' },
  escritorio: null,
  pilares: [
    { pilar: 'retencao', clientes: 40, pares: 12035 },
    { pilar: 'novo', clientes: 19, pares: 995 },
    { pilar: 'reativacao', clientes: 55, pares: 4043 },
  ],
  total: { clientes: 114, pares: 17073 },
};

describe('PositivacaoSection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mostra os 3 pilares com clientes/pares + total de positivados', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ positivacao }) })));
    renderIt();

    await waitFor(() => expect(screen.getByText('Retenção')).toBeInTheDocument());
    expect(screen.getByText('Reativação')).toBeInTheDocument();
    expect(screen.getByText('Novos')).toBeInTheDocument();
    // total de positivados = soma dos pilares
    expect(screen.getByText(/114/)).toBeInTheDocument();
    // clientes por pilar aparecem
    expect(screen.getByText(/40 clientes/)).toBeInTheDocument();
    expect(screen.getByText(/55 clientes/)).toBeInTheDocument();
  });

  it('não quebra quando a positivação vem nula', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ positivacao: null }) })));
    renderIt();
    await waitFor(() => expect(screen.getByText(/sem dado de positivação/i)).toBeInTheDocument());
  });
});

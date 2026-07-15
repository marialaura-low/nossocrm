import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ForecastSection } from './ForecastSection';

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ForecastSection />
    </QueryClientProvider>
  );
}

const forecast = {
  escritorio: null,
  meta_ano: 170931,
  meses_fechados: 6,
  realizado_fechado: 77264,
  meta_fechado: 82931,
  atingimento_fechado: 0.932,
  projecao_ano: 159265,
  gap_ano: -11666,
  serie: [
    { mes: 1, meta: 13431, realizado: 12540 },
    { mes: 2, meta: 6100, realizado: 16339 },
    { mes: 3, meta: 12400, realizado: 15181 },
    { mes: 4, meta: 17000, realizado: 7295 },
    { mes: 5, meta: 17000, realizado: 11438 },
    { mes: 6, meta: 17000, realizado: 14471 },
    { mes: 7, meta: 19000, realizado: 3398 },
    { mes: 8, meta: 12000, realizado: null },
    { mes: 9, meta: 14000, realizado: null },
    { mes: 10, meta: 18000, realizado: null },
    { mes: 11, meta: 15000, realizado: null },
    { mes: 12, meta: 10000, realizado: null },
  ],
};

describe('ForecastSection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mostra projeção do ano, % da meta e gap (ritmo dos meses fechados)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ forecast }) })));
    renderIt();

    // projeção do ano
    await waitFor(() => expect(screen.getByText(/159\.265/)).toBeInTheDocument());
    // meta do ano
    expect(screen.getByText(/170\.931/)).toBeInTheDocument();
    // gap negativo (abaixo da meta)
    expect(screen.getByText(/11\.666/)).toBeInTheDocument();
    // atingimento dos fechados (93%)
    expect(screen.getByText(/93%/)).toBeInTheDocument();
  });

  it('não quebra quando o forecast vem nulo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ forecast: null }) })));
    renderIt();
    await waitFor(() => expect(screen.getByText(/sem curva de meta/i)).toBeInTheDocument());
  });
});

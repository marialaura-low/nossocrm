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
  meta_restante: 88000,
  esforco_restante: 1.064,
  super_meta: null,
  esforco_super: null,
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

  it('meta é a âncora; tendência e gap ao lado; linha de esforço dos meses restantes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ forecast }) })));
    renderIt();

    // espera o DADO chegar (o título renderiza antes do fetch resolver)
    await waitFor(() => expect(screen.getByText(/170\.931/)).toBeInTheDocument());
    expect(screen.getByText('Forecast Atacado')).toBeInTheDocument();
    expect(screen.getByText(/159\.265/)).toBeInTheDocument();
    expect(screen.getByText(/meta do ano · compromisso/)).toBeInTheDocument();
    expect(screen.getByText(/tendência · no ritmo atual/)).toBeInTheDocument();
    // gap e atingimento dos fechados
    expect(screen.getByText(/11\.666/)).toBeInTheDocument();
    expect(screen.getByText(/93%/)).toBeInTheDocument();
    // linha de AÇÃO: esforço dos meses restantes (106% do plano deles)
    expect(screen.getByText(/106%/)).toBeInTheDocument();
    // sem super meta cadastrada → não mostra
    expect(screen.queryByText(/super meta/i)).not.toBeInTheDocument();
  });

  it('mostra a super meta quando cadastrada (alvo esticado, com esforço próprio)', async () => {
    const comSuper = { ...forecast, super_meta: 180000, esforco_super: 1.167 };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ forecast: comSuper }) })));
    renderIt();

    await waitFor(() => expect(screen.getByText(/Super meta 180\.000/)).toBeInTheDocument());
    expect(screen.getByText(/117% do plano restante/)).toBeInTheDocument();
  });

  it('não quebra quando o forecast vem nulo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ forecast: null }) })));
    renderIt();
    await waitFor(() => expect(screen.getByText(/sem curva de meta/i)).toBeInTheDocument());
  });
});

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntensidadeSection } from './IntensidadeSection';

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntensidadeSection />
    </QueryClientProvider>
  );
}

const intensidade = {
  periodo: { inicio: '2026-06-01', fim: '2026-07-01' },
  escritorio: null,
  valor: 3400722.91,
  pares: 17409,
  pedidos: 253,
  clientes: 121,
  arpu: 28105.15,
  ticket_medio: 13441.59,
  frequencia: 2.09,
};

describe('IntensidadeSection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mostra receita/cliente (ARPU traduzido), ticket, frequência e grade média', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ intensidade }) })));
    renderIt();

    // título em português; a sigla vira apoio no hint (regra: jargão sempre traduzido)
    await waitFor(() => expect(screen.getByText('Receita por cliente')).toBeInTheDocument());
    expect(screen.getByText(/ARPU · receita ÷ clientes/)).toBeInTheDocument();
    expect(screen.getByText('Ticket médio')).toBeInTheDocument();
    expect(screen.getByText('Frequência')).toBeInTheDocument();
    // valores em R$
    expect(screen.getByText(/28\.105,15/)).toBeInTheDocument();
    expect(screen.getByText(/13\.441,59/)).toBeInTheDocument();
    // frequência explicitamente mensal
    expect(screen.getByText(/2,09/)).toBeInTheDocument();
    expect(screen.getByText('pedidos/cliente no período')).toBeInTheDocument();
    // grade média = pares ÷ pedidos (17.409/253 ≈ 69 pares/pedido)
    expect(screen.getByText('Grade média')).toBeInTheDocument();
    expect(screen.getByText('69')).toBeInTheDocument();
    expect(screen.getByText('pares/pedido')).toBeInTheDocument();
  });

  it('não quebra quando a intensidade vem nula', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ intensidade: null }) })));
    renderIt();
    await waitFor(() => expect(screen.getByText(/sem dado de intensidade/i)).toBeInTheDocument());
  });
});

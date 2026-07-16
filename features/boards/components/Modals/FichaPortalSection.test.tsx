import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FichaPortalSection } from './FichaPortalSection';

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FichaPortalSection matriz="AUTOFORTE VEICULOS LTDA" escritorio="GREEN SHOES REPRESENTACAO COMERCIAL LTDA" />
    </QueryClientProvider>
  );
}

const ficha = {
  ritmo: { n_pedidos: 43, pares_12m: 260 },
  historico: [
    { pedido: '47055', data: '2026-02-05', pares: 26, desconto: 5.1, loja: { cnpj: '31264770000337', fantasia: 'TOYOTA BARIGUI GUARAPUAVA' } },
    { pedido: '47052', data: '2026-02-05', pares: 26, desconto: null, loja: { cnpj: '31264770000175', fantasia: 'TOYOTA BARIGUI TORRES' } },
  ],
  segmento: { modelo_negocio: 'empresa_uso_proprio', nicho: 'outro', segmento_confirmado: true },
  pedido_na_casa: { ativo: true, pares: 52, entrega: '2026-08-15' },
  ultima_anotacao: { nota: 'falei_ok — comprador de férias', em: '2026-07-10T12:00:00Z', por: 'green-g14sj' },
};

describe('FichaPortalSection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mostra o miolo do portal: segmento, ritmo, pedido na casa e pedidos COM a loja', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ficha })));
    renderIt();

    await waitFor(() => expect(screen.getByText(/Empresa \(uso próprio\)/)).toBeInTheDocument());
    // ritmo
    expect(screen.getByText(/43 pedidos · 260 pares em 12m/)).toBeInTheDocument();
    // pedido na casa (lei do pedido programado)
    expect(screen.getByText(/Pedido na casa: 52 pares/)).toBeInTheDocument();
    // a entrega pro Alex: cada pedido com a LOJA que recebeu
    expect(screen.getByText(/TOYOTA BARIGUI GUARAPUAVA/)).toBeInTheDocument();
    expect(screen.getByText(/TOYOTA BARIGUI TORRES/)).toBeInTheDocument();
    // última anotação (contexto antes de agir)
    expect(screen.getByText(/comprador de férias/)).toBeInTheDocument();
  });

  it('estado vazio honesto quando a matriz não tem histórico no portal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...ficha, historico: [], ritmo: null, pedido_na_casa: null, ultima_anotacao: null }) })));
    renderIt();
    await waitFor(() => expect(screen.getByText(/sem histórico de pedidos no portal/i)).toBeInTheDocument());
  });

  it('não quebra quando a edge falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })));
    renderIt();
    await waitFor(() => expect(screen.getByText(/não consegui puxar a ficha/i)).toBeInTheDocument());
  });
});

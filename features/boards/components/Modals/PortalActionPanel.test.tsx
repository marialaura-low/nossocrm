import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { PortalActionPanel } from './PortalActionPanel';

/**
 * Testes do painel "Registrar ação" (renderizado dentro de DealDetailModal em boards
 * regidos por `motor`). Cobrem só o comportamento do próprio componente — a decisão de
 * QUANDO renderizá-lo (board.regidoPor === 'motor') é testada em DealDetailModal.test.tsx.
 */

function renderPanel(props: Partial<React.ComponentProps<typeof PortalActionPanel>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onDone = props.onDone ?? vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <PortalActionPanel dealId="deal-1" onDone={onDone} {...props} />
    </QueryClientProvider>
  );
  return { ...utils, onDone, queryClient };
}

function stubFetchOnce(body: unknown, { ok = true, status = 200 }: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>, callIndex = 0): Record<string, unknown> {
  const call = fetchMock.mock.calls[callIndex] as [string, RequestInit];
  return JSON.parse(call[1].body as string);
}

describe('PortalActionPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renderiza o título e as ações principais', () => {
    renderPanel();

    expect(screen.getByText(/Registrar ação/)).toBeInTheDocument();
    expect(screen.getByText('Falei — resolvido')).toBeInTheDocument();
    expect(screen.getByText('Falei — ficou pendência')).toBeInTheDocument();
    expect(screen.getByText('Não consegui contato')).toBeInTheDocument();
    expect(screen.getByText('Perdido')).toBeInTheDocument();
  });

  it('clicar em "Falei — ficou pendência" faz POST /api/portal-action com {dealId, resultado} e chama onDone no sucesso', async () => {
    const fetchMock = stubFetchOnce({ ok: true, efeito: 'retry:+5d' });
    const onDone = vi.fn();
    renderPanel({ onDone });

    fireEvent.click(screen.getByText('Falei — ficou pendência'));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal-action',
      expect.objectContaining({ method: 'POST' })
    );
    expect(bodyOf(fetchMock)).toEqual({ dealId: 'deal-1', resultado: 'falei_pendencia' });
  });

  it('"Perdido" sem trocar o motivo ainda envia motivo_slug (valor default do select)', async () => {
    const fetchMock = stubFetchOnce({ ok: true });
    const onDone = vi.fn();
    renderPanel({ onDone });

    fireEvent.click(screen.getByText('Perdido'));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));

    const body = bodyOf(fetchMock);
    expect(body.dealId).toBe('deal-1');
    expect(body.resultado).toBe('perdido');
    expect(body.motivo_slug).toBeTruthy();
  });

  it('mostra o texto de erro retornado pela API e não chama onDone quando a chamada falha', async () => {
    const fetchMock = stubFetchOnce({ error: 'negócio já fechado' }, { ok: false, status: 409 });
    const onDone = vi.fn();
    renderPanel({ onDone });

    fireEvent.click(screen.getByText('Falei — resolvido'));

    await waitFor(() => expect(screen.getByText('negócio já fechado')).toBeInTheDocument());
    expect(onDone).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

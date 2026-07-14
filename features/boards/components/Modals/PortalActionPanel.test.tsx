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

  it('inclui os motivos conflito_internet e fora_estrategia (sincronia com a taxonomia do portal)', () => {
    renderPanel();
    // motivos_perda do portal (migration 021) — o painel tem que oferecer os 2 que o Plaud 07/07 acrescentou
    expect(screen.getByRole('option', { name: 'Conflito com internet' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Fora da estratégia' })).toBeInTheDocument();
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

  // ── Override de gestão (spec união §3, ponte 2 — só admin) ──────────────────

  it('não mostra o override de gestão quando não é admin', () => {
    renderPanel({ funilId: 1 });
    expect(screen.queryByText('Override de gestão')).not.toBeInTheDocument();
  });

  it('admin vê o override com as etapas do funil (pós-venda)', () => {
    renderPanel({ isAdmin: true, funilId: 1 });
    expect(screen.getByText('Override de gestão')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Chegou bem?' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Giro & reposição' })).toBeInTheDocument();
  });

  it('override fica bloqueado sem motivo e envia {override} com etapa+motivo', async () => {
    const fetchMock = stubFetchOnce({ ok: true, efeito: 'override' });
    const onDone = vi.fn();
    renderPanel({ isAdmin: true, funilId: 1, onDone });

    const btn = screen.getByRole('button', { name: 'Mover (gestão)' });
    expect(btn).toBeDisabled(); // sem etapa+motivo

    fireEvent.change(screen.getByLabelText('Mover para'), { target: { value: 'apoio' } });
    fireEvent.change(screen.getByLabelText('Motivo do override'), { target: { value: 'motor errou' } });
    expect(btn).toBeEnabled();

    fireEvent.click(btn);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetchMock)).toEqual({
      dealId: 'deal-1',
      override: { para_etapa_slug: 'apoio', motivo: 'motor errou' },
    });
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

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePortalMetricas } from './usePortalMetricas';
import { PortalScopeProvider } from '../context/PortalScopeContext';

function wrapper(escritorio: string | null, periodo?: { inicio: string; fim: string }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <PortalScopeProvider escritorio={escritorio} inicio={periodo?.inicio} fim={periodo?.fim}>{children}</PortalScopeProvider>
    </QueryClientProvider>
  );
}

describe('usePortalMetricas — decupação por contexto', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sem escritório no contexto: chama a rota sem o param', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => usePortalMetricas(), { wrapper: wrapper(null) });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('escritorio=');
  });

  it('escritório no contexto entra na querystring (sem prop drilling)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => usePortalMetricas(), { wrapper: wrapper('REP GO REPRESENTACAO COMERCIAL LTDA') });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('escritorio=REP+GO');
  });

  it('período do contexto entra na querystring (cards da fusão respeitam o filtro)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => usePortalMetricas(), { wrapper: wrapper(null, { inicio: '2026-01-01', fim: '2027-01-01' }) });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('inicio=2026-01-01');
    expect(url).toContain('fim=2027-01-01');
  });

  it('param explícito vence o contexto', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => usePortalMetricas({ escritorio: 'B2B SIM' }), { wrapper: wrapper('REP GO REPRESENTACAO COMERCIAL LTDA') });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('escritorio=B2B+SIM');
    expect(url).not.toContain('REP+GO');
  });
});

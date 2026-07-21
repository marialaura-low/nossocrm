/**
 * @fileoverview Testes do EvolutionWhatsAppProvider
 *
 * Cobre o contrato HTTP com a Evolution API:
 * - getQrCode: endpoint com path param + parsing das variações de resposta
 * - getLiveConnectionState: estados + instância inexistente (404)
 * - createInstance: body correto + QR retornado na criação
 * - configureWebhook: formato v2.2 (wrapped) com fallback v2.0/v2.1 (flat)
 * - getConnectedPhone: parsing de ownerJid / instance.owner
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EvolutionWhatsAppProvider, EvolutionApiError } from './evolution.provider';

// =============================================================================
// HELPERS
// =============================================================================

const CREDENTIALS = {
  serverUrl: 'https://evolution.example.com',
  instanceName: 'comercial',
  apiKey: 'test-api-key',
};

async function createProvider(
  credentials: Record<string, string> = CREDENTIALS
): Promise<EvolutionWhatsAppProvider> {
  const provider = new EvolutionWhatsAppProvider();
  await provider.initialize({
    channelId: 'channel-uuid',
    channelType: 'whatsapp',
    provider: 'evolution',
    externalIdentifier: '+5511999999999',
    credentials,
  });
  return provider;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  // Silencia logs do provider durante os testes
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// =============================================================================
// getQrCode
// =============================================================================

describe('EvolutionWhatsAppProvider.getQrCode', () => {
  it('chama GET /instance/connect/{instanceName} (path param) com header apikey', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { base64: 'data:image/png;base64,AAA', code: '2@abc' })
    );

    const provider = await createProvider();
    await provider.getQrCode();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://evolution.example.com/instance/connect/comercial');
    expect((init as RequestInit).method).toBe('GET');
    expect((init as { headers: Record<string, string> }).headers.apikey).toBe('test-api-key');
  });

  it('parseia resposta v2 com base64 no top-level e pairingCode', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        pairingCode: 'WZYEH1YY',
        code: '2@y8eK+bjt...',
        base64: 'data:image/png;base64,QRDATA',
        count: 1,
      })
    );

    const provider = await createProvider();
    const result = await provider.getQrCode();

    expect(result.qrCode).toBe('data:image/png;base64,QRDATA');
    expect(result.pairingCode).toBe('WZYEH1YY');
    expect(result.expiresAt).toBeTruthy();
  });

  it('parseia resposta com base64 aninhado em qrcode (shape do /instance/create)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { qrcode: { base64: 'data:image/png;base64,NESTED', pairingCode: 'ABC123' } })
    );

    const provider = await createProvider();
    const result = await provider.getQrCode();

    expect(result.qrCode).toBe('data:image/png;base64,NESTED');
    expect(result.pairingCode).toBe('ABC123');
  });

  it('lança erro quando a instância já está conectada (state open)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { instance: { instanceName: 'comercial', state: 'open' } })
    );

    const provider = await createProvider();
    await expect(provider.getQrCode()).rejects.toThrow(/already connected/i);
  });

  it('propaga EvolutionApiError com status 404 quando a instância não existe', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { status: 404, error: 'Not Found' })
    );

    const provider = await createProvider();
    const error = await provider.getQrCode().catch((e) => e);

    expect(error).toBeInstanceOf(EvolutionApiError);
    expect((error as EvolutionApiError).status).toBe(404);
  });
});

// =============================================================================
// getLiveConnectionState
// =============================================================================

describe('EvolutionWhatsAppProvider.getLiveConnectionState', () => {
  it('retorna o state da instância', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { instance: { state: 'open' } })
    );

    const provider = await createProvider();
    expect(await provider.getLiveConnectionState()).toBe('open');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://evolution.example.com/instance/connectionState/comercial');
  });

  it('retorna null quando a instância não existe (404)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { status: 404, error: 'Not Found' }));

    const provider = await createProvider();
    expect(await provider.getLiveConnectionState()).toBeNull();
  });
});

// =============================================================================
// createInstance
// =============================================================================

describe('EvolutionWhatsAppProvider.createInstance', () => {
  it('cria a instância com qrcode: true e integração Baileys, retornando o QR', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        instance: { instanceName: 'comercial', status: 'created' },
        qrcode: { base64: 'data:image/png;base64,CREATED', pairingCode: 'PAIR01' },
      })
    );

    const provider = await createProvider();
    const result = await provider.createInstance();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://evolution.example.com/instance/create');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      instanceName: 'comercial',
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    });
    expect(result?.qrCode).toBe('data:image/png;base64,CREATED');
    expect(result?.pairingCode).toBe('PAIR01');
  });

  it('retorna null quando a resposta não inclui QR code', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { instance: { instanceName: 'comercial', status: 'created' } })
    );

    const provider = await createProvider();
    expect(await provider.createInstance()).toBeNull();
  });
});

// =============================================================================
// configureWebhook
// =============================================================================

describe('EvolutionWhatsAppProvider.configureWebhook', () => {
  const WEBHOOK_URL = 'https://proj.supabase.co/functions/v1/messaging-webhook-evolution/channel-uuid';

  it('envia formato v2.2 (wrapped) com eventos UPPERCASE e header de auth', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { webhook: {} }));

    const provider = await createProvider();
    const result = await provider.configureWebhook(WEBHOOK_URL);

    expect(result.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://evolution.example.com/webhook/set/comercial');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.webhook.enabled).toBe(true);
    expect(body.webhook.url).toBe(WEBHOOK_URL);
    expect(body.webhook.events).toEqual(['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE']);
    // Sem webhookSecret nas credenciais, usa a apiKey como header de auth
    expect(body.webhook.headers).toEqual({ apikey: 'test-api-key' });
  });

  it('usa webhookSecret como header quando configurado', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { webhook: {} }));

    const provider = await createProvider({ ...CREDENTIALS, webhookSecret: 'super-secret' });
    await provider.configureWebhook(WEBHOOK_URL);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.webhook.headers).toEqual({ apikey: 'super-secret' });
  });

  it('faz fallback para o formato flat v2.0/v2.1 quando o wrapped é rejeitado', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(400, { error: 'Bad Request' }))
      .mockResolvedValueOnce(jsonResponse(201, { webhook: {} }));

    const provider = await createProvider();
    const result = await provider.configureWebhook(WEBHOOK_URL);

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const flatBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(flatBody.enabled).toBe(true);
    expect(flatBody.webhookByEvents).toBe(false);
    expect(flatBody.webhookBase64).toBe(false);
    expect(flatBody.events).toEqual(['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE']);
  });

  it('retorna falha (sem lançar) quando ambos os formatos são rejeitados', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(400, { error: 'Bad Request' }))
      .mockResolvedValueOnce(jsonResponse(400, { error: 'Bad Request' }));

    const provider = await createProvider();
    const result = await provider.configureWebhook(WEBHOOK_URL);

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// =============================================================================
// getConnectedPhone
// =============================================================================

describe('EvolutionWhatsAppProvider.getConnectedPhone', () => {
  it('parseia ownerJid (v2) para formato +E164', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, [{ ownerJid: '5521982219966@s.whatsapp.net' }])
    );

    const provider = await createProvider();
    expect(await provider.getConnectedPhone()).toBe('+5521982219966');
  });

  it('faz fallback para instance.owner (versões antigas)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, [{ instance: { owner: '5511988887777@s.whatsapp.net' } }])
    );

    const provider = await createProvider();
    expect(await provider.getConnectedPhone()).toBe('+5511988887777');
  });

  it('retorna null em erro de rede/HTTP sem propagar exceção', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'boom' }));

    const provider = await createProvider();
    expect(await provider.getConnectedPhone()).toBeNull();
  });
});

// =============================================================================
// getStatus (sanidade do mapeamento de estados)
// =============================================================================

describe('EvolutionWhatsAppProvider.getStatus', () => {
  it.each([
    ['open', 'connected'],
    ['connecting', 'connecting'],
    ['close', 'disconnected'],
    ['refused', 'error'],
  ])('mapeia state "%s" para status "%s"', async (state, expected) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { instance: { state } }));

    const provider = await createProvider();
    const result = await provider.getStatus();

    expect(result.status).toBe(expected);
  });
});

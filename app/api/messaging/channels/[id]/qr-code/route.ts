import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { ChannelProviderFactory, EvolutionWhatsAppProvider } from '@/lib/messaging';
import type { ChannelType, QrCodeResult } from '@/lib/messaging/types';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Monta a URL da edge function que recebe os webhooks da Evolution API.
 */
function getEvolutionWebhookUrl(channelId: string): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/messaging-webhook-evolution/${channelId}`;
}

/**
 * POST /api/messaging/channels/[id]/qr-code
 * Obtém QR code para conexão de canais WhatsApp que autenticam via QR
 * (Evolution API e Z-API).
 *
 * Para Evolution API o fluxo é completo:
 * 1. Consulta o estado real da instância no servidor
 * 2. Cria a instância automaticamente se ela não existir
 * 3. Configura o webhook apontando para a edge function
 * 4. Retorna o QR code (+ pairing code quando disponível)
 */
export async function POST(req: Request, { params }: RouteParams) {
  if (!isAllowedOrigin(req)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const { id: channelId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return json({ error: 'Profile not found' }, 404);
  }

  // Apenas admins podem gerenciar canais
  if (profile.role !== 'admin') {
    return json({ error: 'Forbidden - Admin access required' }, 403);
  }

  // Buscar canal
  const { data: channel, error: channelError } = await supabase
    .from('messaging_channels')
    .select('id, channel_type, provider, external_identifier, credentials, status')
    .eq('id', channelId)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .single();

  if (channelError || !channel) {
    return json({ error: 'Channel not found' }, 404);
  }

  // Verificar se o provider autentica via QR code (feature declarada no registry)
  const supportsQrCode = ChannelProviderFactory.providerSupportsFeature(
    channel.channel_type as ChannelType,
    channel.provider,
    'qr_code'
  );

  if (!supportsQrCode) {
    return json({ error: 'QR code is not supported by this channel provider' }, 400);
  }

  try {
    const provider = ChannelProviderFactory.createProvider(
      channel.channel_type as ChannelType,
      channel.provider
    );

    await provider.initialize({
      channelId: channel.id,
      channelType: channel.channel_type as ChannelType,
      provider: channel.provider,
      externalIdentifier: channel.external_identifier,
      credentials: channel.credentials as Record<string, string>,
    });

    let qrResult: QrCodeResult | null = null;
    let webhookConfigured = false;

    if (provider instanceof EvolutionWhatsAppProvider) {
      // 1. Estado real no servidor Evolution (fonte da verdade, não o banco)
      const liveState = await provider.getLiveConnectionState();

      if (liveState === 'open') {
        await supabase
          .from('messaging_channels')
          .update({
            status: 'connected',
            status_message: null,
            last_connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', channelId);

        return json({ alreadyConnected: true });
      }

      // 2. Instância não existe no servidor → criar automaticamente
      if (liveState === null) {
        qrResult = await provider.createInstance();
      }

      // 3. Configurar webhook (best-effort; instruções manuais seguem na UI)
      const webhookUrl = getEvolutionWebhookUrl(channelId);
      if (webhookUrl) {
        const webhookResult = await provider.configureWebhook(webhookUrl);
        webhookConfigured = webhookResult.success;
        if (!webhookResult.success) {
          console.warn(
            `[qr-code] Failed to auto-configure Evolution webhook for channel ${channelId}:`,
            webhookResult.error
          );
        }
      }

      // 4. QR code (se a criação da instância ainda não retornou um)
      if (!qrResult) {
        qrResult = await provider.getQrCode();
      }
    } else {
      // Z-API (e futuros providers com qr_code): fluxo simples via getQrCode
      if (channel.status === 'connected') {
        return json({ error: 'Channel is already connected' }, 400);
      }

      if (typeof provider.getQrCode !== 'function') {
        return json({ error: 'Provider does not support QR code' }, 500);
      }

      qrResult = await provider.getQrCode();
    }

    // Atualizar status do canal para waiting_qr
    await supabase
      .from('messaging_channels')
      .update({
        status: 'waiting_qr',
        status_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', channelId);

    return json({
      qrCode: qrResult.qrCode,
      pairingCode: qrResult.pairingCode,
      expiresAt: qrResult.expiresAt,
      webhookConfigured,
    });
  } catch (error) {
    console.error('Error getting QR code:', error);

    // Atualizar status do canal para error
    await supabase
      .from('messaging_channels')
      .update({
        status: 'error',
        status_message: error instanceof Error ? error.message : 'Unknown error',
        updated_at: new Date().toISOString(),
      })
      .eq('id', channelId);

    return json({
      error: error instanceof Error ? error.message : 'Failed to get QR code'
    }, 500);
  }
}

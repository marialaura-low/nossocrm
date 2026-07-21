import { createClient } from '@/lib/supabase/server';
import { ChannelProviderFactory, EvolutionWhatsAppProvider } from '@/lib/messaging';
import type { ChannelType, ChannelStatus } from '@/lib/messaging/types';

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
 * GET /api/messaging/channels/[id]/status
 * Consulta o status de conexão AO VIVO no provider e sincroniza o banco.
 *
 * Usada pelo modal de conexão via QR code (polling) — na primeira conexão o
 * webhook `connection.update` não chega, porque a edge function só aceita
 * canais com status connected/active. O polling é o caminho de confirmação.
 *
 * Regras de sincronização:
 * - live `connected`  → grava connected + last_connected_at (+ displayPhone)
 * - live `error`      → grava error com a mensagem
 * - live `disconnected` → só grava se o banco dizia connected (detecção de queda);
 *   durante o fluxo de QR (waiting_qr) o banco é preservado
 */
export async function GET(_req: Request, { params }: RouteParams) {
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

  const { data: channel, error: channelError } = await supabase
    .from('messaging_channels')
    .select('id, channel_type, provider, external_identifier, credentials, settings, status')
    .eq('id', channelId)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .single();

  if (channelError || !channel) {
    return json({ error: 'Channel not found' }, 404);
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

    const live = await provider.getStatus();
    const currentStatus = channel.status as ChannelStatus;

    let displayPhone: string | undefined;
    const update: Record<string, unknown> = {};

    if (live.status === 'connected') {
      if (currentStatus !== 'connected') {
        update.status = 'connected';
        update.status_message = null;
        update.last_connected_at = new Date().toISOString();

        if (provider instanceof EvolutionWhatsAppProvider) {
          const phone = await provider.getConnectedPhone();
          if (phone) {
            displayPhone = phone;
            update.settings = {
              ...((channel.settings as Record<string, unknown>) ?? {}),
              displayPhone: phone,
            };
          }
        }
      }
    } else if (live.status === 'error') {
      if (currentStatus !== 'error') {
        update.status = 'error';
        update.status_message = live.message ?? null;
      }
    } else if (live.status === 'disconnected' && currentStatus === 'connected') {
      // Queda de conexão detectada; durante waiting_qr o banco é preservado
      update.status = 'disconnected';
      update.status_message = live.message ?? null;
    }

    if (Object.keys(update).length > 0) {
      update.updated_at = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('messaging_channels')
        .update(update)
        .eq('id', channelId);

      if (updateError) {
        console.error('[channel-status] Failed to sync channel status:', updateError);
      }
    }

    return json({
      status: live.status,
      message: live.message,
      displayPhone,
    });
  } catch (error) {
    console.error('[channel-status] Error checking channel status:', error);
    return json({
      error: error instanceof Error ? error.message : 'Failed to check channel status',
    }, 500);
  }
}

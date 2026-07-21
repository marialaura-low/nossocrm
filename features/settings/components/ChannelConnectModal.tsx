'use client';

/**
 * @fileoverview Modal de conexão de canal WhatsApp via QR code
 *
 * Fluxo (Evolution API e Z-API):
 * 1. Ao abrir, chama POST /api/messaging/channels/[id]/qr-code
 *    (para Evolution: cria a instância no servidor se necessário e
 *    configura o webhook automaticamente)
 * 2. Exibe o QR code com countdown de expiração (auto-renova)
 * 3. Faz polling de GET /api/messaging/channels/[id]/status até conectar
 * 4. Ao conectar, invalida as queries de canais e mostra sucesso
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { queryKeys } from '@/lib/query/queryKeys';
import type { MessagingChannel } from '@/lib/messaging/types';

// =============================================================================
// CONSTANTS & TYPES
// =============================================================================

const STATUS_POLL_INTERVAL_MS = 3000;
const MAX_AUTO_REFRESH = 4; // renovações automáticas do QR antes de exigir clique

type ConnectStep = 'loading' | 'qr' | 'connected' | 'error';

interface QrData {
  qrCode: string;
  pairingCode?: string;
  expiresAt?: string;
  webhookConfigured?: boolean;
}

interface ChannelConnectModalProps {
  channel: MessagingChannel | null;
  isOpen: boolean;
  onClose: () => void;
}

/** Aceita tanto data URL quanto base64 puro (varia por provider). */
function toImageSrc(qrCode: string): string {
  return qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ChannelConnectModal({ channel, isOpen, onClose }: ChannelConnectModalProps) {
  const queryClient = useQueryClient();

  const [step, setStep] = useState<ConnectStep>('loading');
  const [qrData, setQrData] = useState<QrData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [displayPhone, setDisplayPhone] = useState<string | null>(null);

  // Identifica a "sessão" de conexão atual para ignorar respostas de
  // fetches disparados antes de o modal fechar/reabrir.
  const sessionRef = useRef(0);
  const autoRefreshCountRef = useRef(0);

  const channelId = channel?.id ?? null;

  const invalidateChannels = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.messagingChannels.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.messagingChannels.connected() });
    if (channelId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.messagingChannels.detail(channelId) });
    }
  }, [queryClient, channelId]);

  const fetchQrCode = useCallback(async () => {
    if (!channelId) return;
    const session = sessionRef.current;

    setStep('loading');
    setErrorMessage('');

    try {
      const res = await fetch(`/api/messaging/channels/${channelId}/qr-code`, {
        method: 'POST',
      });
      const data = await res.json();

      if (session !== sessionRef.current) return; // modal fechou/reabriu

      if (data.alreadyConnected) {
        setStep('connected');
        invalidateChannels();
        return;
      }

      if (!res.ok || !data.qrCode) {
        setErrorMessage(data.error || 'Não foi possível gerar o QR code.');
        setStep('error');
        return;
      }

      setQrData(data as QrData);
      setStep('qr');
    } catch {
      if (session !== sessionRef.current) return;
      setErrorMessage('Falha de rede ao gerar o QR code.');
      setStep('error');
    }
  }, [channelId, invalidateChannels]);

  // Reset + primeira busca ao abrir
  useEffect(() => {
    if (!isOpen || !channelId) return;

    sessionRef.current += 1;
    autoRefreshCountRef.current = 0;
    setQrData(null);
    setErrorMessage('');
    setSecondsLeft(null);
    setDisplayPhone(null);
    fetchQrCode();

    return () => {
      sessionRef.current += 1; // invalida fetches pendentes ao fechar
    };
  }, [isOpen, channelId, fetchQrCode]);

  // Polling de status enquanto o QR está na tela
  useEffect(() => {
    if (!isOpen || !channelId || step !== 'qr') return;

    const session = sessionRef.current;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/messaging/channels/${channelId}/status`);
        if (!res.ok) return;
        const data = await res.json();

        if (session !== sessionRef.current) return;

        if (data.status === 'connected') {
          if (data.displayPhone) setDisplayPhone(data.displayPhone);
          setStep('connected');
          invalidateChannels();
        }
      } catch {
        // erro transitório de polling — próxima iteração tenta de novo
      }
    }, STATUS_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isOpen, channelId, step, invalidateChannels]);

  // Countdown de expiração do QR + auto-renovação
  useEffect(() => {
    if (step !== 'qr' || !qrData?.expiresAt) return;

    const expiresAtMs = new Date(qrData.expiresAt).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
      setSecondsLeft(remaining);

      if (remaining <= 0 && autoRefreshCountRef.current < MAX_AUTO_REFRESH) {
        autoRefreshCountRef.current += 1;
        fetchQrCode();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [step, qrData, fetchQrCode]);

  const handleManualRefresh = () => {
    autoRefreshCountRef.current = 0;
    fetchQrCode();
  };

  const qrExpired = secondsLeft !== null && secondsLeft <= 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Conectar ${channel?.name ?? 'canal'}`}
      size="md"
    >
      {/* Loading */}
      {step === 'loading' && (
        <div className="py-12 text-center space-y-3">
          <Loader2 className="w-10 h-10 mx-auto text-primary-600 animate-spin" />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Preparando conexão com o WhatsApp...
          </p>
        </div>
      )}

      {/* QR Code */}
      {step === 'qr' && qrData && (
        <div className="space-y-5">
          <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
            <ol className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside">
              <li>Abra o WhatsApp no celular do número comercial</li>
              <li>Toque em <strong>Configurações → Dispositivos conectados</strong></li>
              <li>Toque em <strong>Conectar dispositivo</strong> e aponte a câmera para o código</li>
            </ol>
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="relative p-3 bg-white rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
              {/* QR codes precisam de fundo branco mesmo em dark mode */}
              <img
                src={toImageSrc(qrData.qrCode)}
                alt="QR code para conectar o WhatsApp"
                className="w-56 h-56 object-contain"
              />
              {qrExpired && (
                <div className="absolute inset-0 rounded-2xl bg-white/90 dark:bg-slate-900/90 flex flex-col items-center justify-center gap-3">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    QR code expirado
                  </p>
                  <button
                    onClick={handleManualRefresh}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold
                      bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Gerar novo QR code
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>
                Aguardando leitura
                {secondsLeft !== null && secondsLeft > 0 && ` · expira em ${secondsLeft}s`}
              </span>
            </div>

            {qrData.pairingCode && (
              <div className="text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Ou conecte pelo código no celular:
                </p>
                <code className="text-base font-mono font-bold tracking-widest text-slate-900 dark:text-white bg-slate-100 dark:bg-white/10 px-3 py-1.5 rounded-lg">
                  {qrData.pairingCode}
                </code>
              </div>
            )}
          </div>

          {qrData.webhookConfigured === false && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
              <p className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Não foi possível configurar o webhook automaticamente. Após conectar,
                configure-o manualmente seguindo as instruções no card do canal.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Connected */}
      {step === 'connected' && (
        <div className="py-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-500/10 flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              WhatsApp conectado!
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {displayPhone ? (
                <span className="inline-flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" />
                  {displayPhone}
                </span>
              ) : (
                'O canal está pronto para enviar e receber mensagens.'
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold
              bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            Concluir
          </button>
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div className="py-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 mx-auto text-red-500" />
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Não foi possível gerar o QR code
            </h3>
            <p className="text-sm text-red-600 dark:text-red-400 mt-2 break-words max-w-md mx-auto">
              {errorMessage}
            </p>
          </div>
          <button
            onClick={handleManualRefresh}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold
              bg-slate-900 dark:bg-white text-white dark:text-slate-900
              hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </button>
        </div>
      )}
    </Modal>
  );
}

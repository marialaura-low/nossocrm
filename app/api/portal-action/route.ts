import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const RESULTADOS = ['falei_ok', 'falei_pendencia', 'sem_contato', 'perdido'];

interface PortalActionBody {
  dealId?: string;
  resultado?: string;
  motivo_slug?: string;
  obs?: string;
  nota?: unknown;
  override?: {
    para_etapa_slug?: string;
    motivo?: string;
  };
}

/**
 * POST /api/portal-action
 *
 * Escreve uma ação de funil (resultado de contato ou override manual) direto
 * no portal dos representantes, via edge function `funil-update` do projeto
 * portal (admin-only, token no header — nunca na URL), e dispara um re-sync
 * imediato do espelho Maré/CRM (edge `sync-funil-portal`) para o board
 * refletir a mudança na hora, sem esperar o cron diário das 07h.
 *
 * Onda 1: gestão opera isso; qualquer usuário autenticado do CRM pode chamar
 * (sem gate extra de role).
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
    }

    const b: PortalActionBody = await req.json();
    const isOverride = Boolean(b.override);

    if (!isOverride && (!b.resultado || !RESULTADOS.includes(b.resultado))) {
      return NextResponse.json({ error: 'resultado inválido' }, { status: 400 });
    }
    if (b.resultado === 'perdido' && !b.motivo_slug) {
      return NextResponse.json({ error: 'perdido exige motivo_slug' }, { status: 400 });
    }

    // deals é protegido por RLS (deals_org_isolate: organization_id = get_user_org_id()),
    // então este select via createClient() (não admin) já não vaza deals de outra org.
    const { data: deal } = await supabase
      .from('deals')
      .select('id,custom_fields')
      .eq('id', b.dealId)
      .maybeSingle();

    const customFields = (deal?.custom_fields ?? null) as Record<string, unknown> | null;
    const negocioId = customFields?.portal_negocio_id;
    if (!negocioId) {
      return NextResponse.json({ error: 'deal não é espelho do portal' }, { status: 400 });
    }

    const payload = isOverride
      ? {
          override: {
            negocio_id: negocioId,
            para_etapa_slug: b.override?.para_etapa_slug,
            motivo: b.override?.motivo,
          },
        }
      : {
          negocio_id: negocioId,
          resultado: b.resultado,
          motivo_slug: b.motivo_slug,
          obs: b.obs,
          nota: b.nota,
        };

    const portalRes = await fetch(process.env.PORTAL_FUNIL_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-portal-token': process.env.PORTAL_FUNIL_TOKEN!,
      },
      body: JSON.stringify(payload),
    });
    const body = await portalRes.json();

    if (!portalRes.ok) {
      return NextResponse.json(body, { status: portalRes.status });
    }

    // Re-sync imediato do espelho — best-effort. Se falhar (rede, edge fora,
    // gateway rejeitando por falta de JWT válido), o cron diário das 07h
    // reconcilia; não derruba a resposta de sucesso do portal.
    try {
      await fetch(process.env.CRM_SYNC_URL!, {
        method: 'POST',
        headers: { 'x-sync-secret': process.env.CRM_SYNC_SECRET! },
      });
    } catch (syncError) {
      console.error('[portal-action] re-sync imediato falhou, cron diário reconcilia:', syncError);
    }

    return NextResponse.json(body);
  } catch (error) {
    console.error('[portal-action]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'erro interno' }, { status: 500 });
  }
}

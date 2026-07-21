// app/api/inbound/lead/route.ts
// Webhook NEUTRO de ferramenta: recebe um lead JÁ qualificado de qualquer
// automação (GPT Maker, n8n, Make, stack do Gabriel...) via POST + x-internal-secret.
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { enrichCnpj } from '@/lib/inbound/cnpj';
import { checkConflito } from '@/lib/inbound/conflito';
import { checkTerritorio } from '@/lib/inbound/territorio';
import type { LeadInbound } from '@/lib/inbound/types';

export const dynamic = 'force-dynamic';

const ORG = '171ea789-b0e9-43fa-8e24-ca685057b617';
const OWNER = 'c08dbd94-14ef-42fe-97f4-500dee3628b0';

function secretOk(req: Request): boolean {
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected) return false;
  const got = req.headers.get('x-internal-secret')
    || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!got) return false;
  const a = Buffer.from(got, 'utf8'), b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!secretOk(req)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 });

  let body: Partial<LeadInbound>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'json inválido' }, { status: 400 }); }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'corpo inválido' }, { status: 400 });
  }

  const cnpj = (typeof body.cnpj === 'string' ? body.cnpj : '').replace(/\D/g, '');
  if (cnpj.length !== 14 || typeof body.nomeLoja !== 'string' || !body.nomeLoja) {
    return NextResponse.json({ error: 'cnpj e nomeLoja obrigatórios' }, { status: 400 });
  }

  const [porte, conflito, territorio] = await Promise.all([
    enrichCnpj(cnpj), checkConflito(cnpj), checkTerritorio(body.cidade, body.uf),
  ]);

  const supabase = createStaticAdminClient();
  const { data: board } = await supabase.from('boards').select('id')
    .eq('key', 'inbound-caca-pesca').eq('organization_id', ORG).single();
  if (!board) return NextResponse.json({ error: 'board não encontrado' }, { status: 500 });

  const tags: string[] = ['inbound', 'caca-pesca'];
  if (conflito.jaCliente) tags.push('conflito');
  if (!porte.cnpjValido) tags.push('cnpj-nao-verificado');
  else if (!porte.fitSortimento) tags.push('sem-fit');
  // Território (por cidade) — sinaliza, não bloqueia. Rep segue segurado nesta fase.
  if (territorio.repDominante) tags.push('territorio-rep');
  if (territorio.disputado) tags.push('territorio-disputado');
  if (territorio.casa) tags.push('territorio-casa');
  if (!territorio.mapeado) tags.push('territorio-novo');

  const custom_fields = {
    origem: 'inbound-caca-pesca', cnpj,
    cidade: body.cidade ?? null, uf: body.uf ?? null,
    sortimento: body.sortimento ?? null, marcas: body.marcas ?? null,
    contato_nome: body.contatoNome ?? null, contato_whatsapp: body.contatoWhatsapp ?? null,
    ad_referral: body.adReferral ?? null, transcript: body.transcript ?? null,
    porte, conflito, territorio,
  };

  // DEDUP: já existe card ABERTO do mesmo CNPJ neste board? Atualiza em vez de duplicar.
  // Card fechado (Ganho/Perdido) não conta — lead que volta merece card novo.
  const { data: aberto } = await supabase.from('deals').select('id, stage_id')
    .eq('board_id', board.id).eq('status', 'open').eq('custom_fields->>cnpj', cnpj)
    .limit(1).maybeSingle();

  if (aberto) {
    // Reengajamento: atualiza os dados, NUNCA rebaixa o estágio (o Closer pode já ter movido o card).
    const { data: upd, error: updErr } = await supabase.from('deals').update({
      title: body.nomeLoja,
      tags: [...tags, 'reengajou'],
      custom_fields,
    }).eq('id', aberto.id).select('id').single();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, dealId: upd.id, deduped: true });
  }

  const { data: stage, error: stageErr } = await supabase.from('board_stages').select('id')
    .eq('board_id', board.id).eq('name', 'Pré-qualificado').single();
  if (stageErr || !stage) return NextResponse.json({ error: 'estágio Pré-qualificado não encontrado' }, { status: 500 });

  const { data: deal, error } = await supabase.from('deals').insert({
    organization_id: ORG, owner_id: OWNER,
    title: body.nomeLoja, value: 0, status: 'open', priority: 'medium',
    board_id: board.id, stage_id: stage.id,
    tags,
    custom_fields,
  }).select('id').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, dealId: deal.id, deduped: false });
}

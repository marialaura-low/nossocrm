# Fase 0 — Inbound Caça&Pesca: Plano de Implementação

> **Para quem executa:** este plano é bite-sized. Tarefas de código (Parte A) seguem TDD (teste falha → implementa → passa → commita). Tarefas de config SaaS (Parte B, GPT Maker) não têm teste automatizado — têm checklist + critério de aceite no web chat.
>
> **Donos:** 🔧 = nós (código no Maré) · 🤖 = Gabriel (GPT Maker) · 🤝 = juntos.

**Goal:** Provar o funil de inbound de lojista (caça&pesca) ponta a ponta — bot qualifica no GPT Maker → cria card no Maré com porte inferido + flag de conflito — SEM depender da Meta/número (tudo no web chat do GPT Maker + dado sintético rotulado).

**Arquitetura:** GPT Maker (agente SaaS) roda o roteiro e, ao qualificar, chama um webhook nosso `POST /api/inbound/gpt-maker` no app do Maré. O webhook enriquece o CNPJ (BrasilAPI), cruza conflito contra o portal Macboot (read-only) e cria um `deal` no board "Inbound Caça&Pesca". Nada toca produção do portal (só leitura).

**Tech stack:** Next.js 16 API route + Supabase (Maré `utkmwgdydggzmyqksnql`) via `createStaticAdminClient`; leitura do portal (`cvqczrciitcteabvonmw`) via edge `portal-cliente`; Vitest; BrasilAPI (CNPJ). Spec: `docs/2026-07-20-inbound-caca-pesca-whatsapp-crm-design.md`.

---

## Pré-requisitos (fazer antes da Task A1)

- [ ] 🔧 Gerar `INTERNAL_API_SECRET` (32+ bytes aleatórios) e setar no Vercel (env do Maré) + `.env.local`. Guardar no 1Password (vault Una). **Esse segredo o Gabriel usa no header do GPT Maker.**
- [ ] Confirmar que já existem no `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `PORTAL_REST_URL`, `PORTAL_FUNIL_TOKEN`. (Explorado: existem.)
- [ ] 🤖 Gabriel: criar conta no GPT Maker (curso módulo 0.3) — só a conta, sem número ainda.

**Constantes conhecidas (do repo):** `ORG = '171ea789-b0e9-43fa-8e24-ca685057b617'` · `OWNER = 'c08dbd94-14ef-42fe-97f4-500dee3628b0'`.

---

## Mapa de arquivos

| Arquivo | Responsabilidade | Dono |
|---|---|---|
| `supabase/migrations/20260720120000_inbound_caca_pesca_board.sql` | Cria board + 5 estágios | 🔧 |
| `lib/inbound/cnpj.ts` | Enriquecer CNPJ (BrasilAPI) → sinal de porte + fit | 🔧 |
| `lib/inbound/conflito.ts` | Checar "já é cliente?" no portal (read-only) | 🔧 |
| `lib/inbound/types.ts` | Tipos compartilhados (LeadInbound, PorteSinal, Conflito) | 🔧 |
| `app/api/inbound/gpt-maker/route.ts` | Webhook: valida secret → enrich → conflito → cria deal | 🔧 |
| `test/inbound/cnpj.test.ts` · `conflito.test.ts` · `test/api/inbound-gpt-maker.test.ts` | Testes | 🔧 |
| (GPT Maker SaaS — sem arquivo) | Agente, roteiro, entrada loja/consumidor, chamada do webhook | 🤖 |

---

# PARTE A — Código no Maré (🔧 nós)

## Task A0: Tipos compartilhados

**Files:** Create `lib/inbound/types.ts`

- [ ] **Passo 1: Escrever os tipos**

```ts
// lib/inbound/types.ts
// Sinal de porte inferido do CNPJ — NUNCA perguntado ao lead.
export interface PorteSinal {
  razaoSocial: string | null;
  nomeFantasia: string | null;
  cnaePrincipal: string | null;      // código
  cnaeDescricao: string | null;      // texto
  capitalSocial: number | null;
  dataInicioAtividade: string | null; // ISO
  nFiliais: number | null;
  fitSortimento: boolean;            // CNAE bate caça/pesca/outdoor/agro/calçado/esporte
  cnpjValido: boolean;
}

export interface Conflito {
  jaCliente: boolean;
  escritorio: string | null;   // rep dono, se já cliente
  ultimoPedido: string | null; // data ISO do último pedido, se houver
}

// Payload que o GPT Maker manda ao qualificar um lojista.
export interface LeadInbound {
  nomeLoja: string;
  cidade: string;
  uf: string;
  cnpj: string;              // só dígitos
  sortimento: string;        // resposta livre (caça/pesca/agro/…)
  marcas: string;            // marcas que já trabalha (texto livre)
  contatoNome: string;
  contatoWhatsapp: string;
  transcript: string;        // conversa inteira
  adReferral: string | null; // qual anúncio/criativo trouxe (campo referral do CTWA)
}
```

- [ ] **Passo 2: Commit**

```bash
git add lib/inbound/types.ts
git commit -m "feat(inbound): tipos compartilhados do funil caca&pesca"
```

---

## Task A1: Migration do board "Inbound Caça&Pesca"

**Files:** Create `supabase/migrations/20260720120000_inbound_caca_pesca_board.sql`

- [ ] **Passo 1: Escrever a migration**

```sql
-- Board de inbound (lojistas caça&pesca). regido_por='humano' (Tiago/Simone
-- operam manual, ao contrário dos boards de portal que são 'motor').
DO $$
DECLARE
  v_org   UUID := '171ea789-b0e9-43fa-8e24-ca685057b617';
  v_owner UUID := 'c08dbd94-14ef-42fe-97f4-500dee3628b0';
  v_board UUID;
BEGIN
  INSERT INTO public.boards (key, name, description, type, regido_por, position, organization_id, owner_id)
  VALUES ('inbound-caca-pesca', 'Inbound Caça&Pesca',
          'Aquisição de lojista via tráfego pago. Bot qualifica no GPT Maker.',
          'SALES', 'humano', 100, v_org, v_owner)
  ON CONFLICT (organization_id, key) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_board;

  IF v_board IS NULL THEN
    SELECT id INTO v_board FROM public.boards
      WHERE organization_id = v_org AND key = 'inbound-caca-pesca';
  END IF;

  -- 5 estágios (idempotente por board+name)
  INSERT INTO public.board_stages (board_id, name, "order", color, organization_id)
  VALUES
    (v_board, 'Novo (bot)',      0, '#9ca3af', v_org),
    (v_board, 'Pré-qualificado', 1, '#2f7a4d', v_org),
    (v_board, 'Com o Closer',    2, '#07432a', v_org),
    (v_board, 'Ganho',           3, '#16a34a', v_org),
    (v_board, 'Perdido',         4, '#dc2626', v_org)
  ON CONFLICT DO NOTHING;
END $$;
```

- [ ] **Passo 2: Aplicar no Maré remoto**

Run: `supabase db push` (se o CLI estiver linkado ao ref `utkmwgdydggzmyqksnql`).
Alternativa (MCP Supabase): `apply_migration` com o SQL acima.
Expected: board + 5 stages criados.

- [ ] **Passo 3: Verificar em produção**

Run:
```bash
source .env.local 2>/dev/null
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/boards?key=eq.inbound-caca-pesca&select=id,name,regido_por" \
  -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY"
```
Expected: 1 board `Inbound Caça&Pesca`, `regido_por: humano`.

- [ ] **Passo 4: Commit**

```bash
git add supabase/migrations/20260720120000_inbound_caca_pesca_board.sql
git commit -m "feat(inbound): board Inbound Caca&Pesca com 5 estagios"
```

---

## Task A2: Enriquecimento de CNPJ (porte discreto)

**Files:** Create `lib/inbound/cnpj.ts` · Test `test/inbound/cnpj.test.ts`

- [ ] **Passo 1: Escrever o teste que falha**

```ts
// test/inbound/cnpj.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichCnpj } from '@/lib/inbound/cnpj';

const RESP_PESCA = {
  razao_social: 'CACA E PESCA LTDA', nome_fantasia: 'PESQUEIRO DO ZE',
  cnae_fiscal: 4763603, cnae_fiscal_descricao: 'Comércio varejista de artigos de caça, pesca e camping',
  capital_social: 200000, data_inicio_atividade: '2015-03-01',
  qsa: [], cnaes_secundarios: [],
};

beforeEach(() => vi.restoreAllMocks());

describe('enrichCnpj', () => {
  it('marca fitSortimento=true e extrai porte quando CNAE é de caça/pesca', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => RESP_PESCA,
    }));
    const r = await enrichCnpj('12345678000199');
    expect(r.cnpjValido).toBe(true);
    expect(r.fitSortimento).toBe(true);
    expect(r.capitalSocial).toBe(200000);
    expect(r.razaoSocial).toBe('CACA E PESCA LTDA');
  });

  it('fitSortimento=false para CNAE sem relação (ex.: padaria)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ ...RESP_PESCA, cnae_fiscal_descricao: 'Padaria e confeitaria' }),
    }));
    const r = await enrichCnpj('12345678000199');
    expect(r.fitSortimento).toBe(false);
  });

  it('cnpjValido=false quando a BrasilAPI dá 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    const r = await enrichCnpj('00000000000000');
    expect(r.cnpjValido).toBe(false);
    expect(r.fitSortimento).toBe(false);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npm run test:run -- test/inbound/cnpj.test.ts`
Expected: FAIL (`enrichCnpj` não existe).

- [ ] **Passo 3: Implementar**

```ts
// lib/inbound/cnpj.ts
import type { PorteSinal } from './types';

const FIT_KEYWORDS = [
  'caça', 'caca', 'pesca', 'camping', 'esportiv', 'artigos esportivos',
  'náutic', 'nautic', 'outdoor', 'agropecuár', 'agropecuar', 'agro',
  'calçad', 'calcad', 'vestuário', 'vestuario', 'militar', 'tático', 'tatico',
];

function normaliza(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export async function enrichCnpj(cnpjDigits: string): Promise<PorteSinal> {
  const empty: PorteSinal = {
    razaoSocial: null, nomeFantasia: null, cnaePrincipal: null, cnaeDescricao: null,
    capitalSocial: null, dataInicioAtividade: null, nFiliais: null,
    fitSortimento: false, cnpjValido: false,
  };
  const cnpj = (cnpjDigits || '').replace(/\D/g, '');
  if (cnpj.length !== 14) return empty;

  let resp: Response;
  try {
    resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  } catch {
    return empty;
  }
  if (!resp.ok) return empty;
  const d = await resp.json();

  const desc: string = d.cnae_fiscal_descricao || '';
  const descNorm = normaliza(desc);
  const secundarios: string[] = (d.cnaes_secundarios || []).map((c: { descricao?: string }) => normaliza(c.descricao || ''));
  const fit = [descNorm, ...secundarios].some((t) => FIT_KEYWORDS.some((k) => t.includes(normaliza(k))));

  return {
    razaoSocial: d.razao_social ?? null,
    nomeFantasia: d.nome_fantasia ?? null,
    cnaePrincipal: d.cnae_fiscal != null ? String(d.cnae_fiscal) : null,
    cnaeDescricao: desc || null,
    capitalSocial: typeof d.capital_social === 'number' ? d.capital_social : null,
    dataInicioAtividade: d.data_inicio_atividade ?? null,
    nFiliais: null, // BrasilAPI não devolve contagem de filiais neste endpoint; Fase 1 se precisar
    fitSortimento: fit,
    cnpjValido: true,
  };
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npm run test:run -- test/inbound/cnpj.test.ts`
Expected: PASS (3 testes).

- [ ] **Passo 5: Commit**

```bash
git add lib/inbound/cnpj.ts test/inbound/cnpj.test.ts
git commit -m "feat(inbound): enriquecimento de CNPJ via BrasilAPI (porte + fit de sortimento)"
```

---

## Task A3: Checagem de conflito (já é cliente?)

Lê o portal Macboot via edge `portal-cliente` (mesmo caminho da rota `app/api/portal-ficha/route.ts`), passando o CNPJ como `matriz`. Se voltar histórico de pedidos → já é cliente, e traz o escritório/rep.

**Files:** Create `lib/inbound/conflito.ts` · Test `test/inbound/conflito.test.ts`

- [ ] **Passo 1: Escrever o teste que falha**

```ts
// test/inbound/conflito.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkConflito } from '@/lib/inbound/conflito';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubEnv('PORTAL_REST_URL', 'https://cvqczrciitcteabvonmw.supabase.co/rest/v1');
  vi.stubEnv('PORTAL_FUNIL_TOKEN', 'tok');
});

describe('checkConflito', () => {
  it('jaCliente=true quando a edge devolve pedidos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ escritorio: 'REP GO', pedidos: [{ data: '2026-05-10', pares: 60 }] }),
    }));
    const r = await checkConflito('12345678000199');
    expect(r.jaCliente).toBe(true);
    expect(r.escritorio).toBe('REP GO');
    expect(r.ultimoPedido).toBe('2026-05-10');
  });

  it('jaCliente=false quando a edge não acha o cliente (404/vazio)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    const r = await checkConflito('99999999000199');
    expect(r.jaCliente).toBe(false);
    expect(r.escritorio).toBeNull();
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npm run test:run -- test/inbound/conflito.test.ts`
Expected: FAIL (`checkConflito` não existe).

- [ ] **Passo 3: Implementar**

```ts
// lib/inbound/conflito.ts
import type { Conflito } from './types';

export async function checkConflito(cnpjDigits: string): Promise<Conflito> {
  const none: Conflito = { jaCliente: false, escritorio: null, ultimoPedido: null };
  const cnpj = (cnpjDigits || '').replace(/\D/g, '');
  const base = process.env.PORTAL_REST_URL;
  const token = process.env.PORTAL_FUNIL_TOKEN;
  if (!cnpj || !base || !token) return none;

  const url = base.replace('/rest/v1', '/functions/v1/portal-cliente')
    + `?matriz=${encodeURIComponent(cnpj)}`;
  let resp: Response;
  try {
    resp = await fetch(url, { headers: { 'x-portal-token': token } });
  } catch {
    return none;
  }
  if (!resp.ok) return none;
  const d = await resp.json();
  const pedidos: Array<{ data?: string }> = Array.isArray(d?.pedidos) ? d.pedidos : [];
  if (pedidos.length === 0) return none;

  const datas = pedidos.map((p) => p.data).filter(Boolean).sort();
  return {
    jaCliente: true,
    escritorio: d?.escritorio ?? null,
    ultimoPedido: datas.length ? (datas[datas.length - 1] as string) : null,
  };
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npm run test:run -- test/inbound/conflito.test.ts`
Expected: PASS (2 testes).

- [ ] **Passo 5: Commit**

```bash
git add lib/inbound/conflito.ts test/inbound/conflito.test.ts
git commit -m "feat(inbound): checagem de conflito ja-cliente via edge portal-cliente"
```

> **Escopo honesto (não é silêncio):** Fase 0 detecta conflito só de **já-cliente** (dá pra cruzar por CNPJ). Conflito de **território de rep pra CNPJ NOVO** (cidade → rep dono) precisa de mapa cidade→rep que hoje não é dado limpo → **fica pra Fase 1**. O card já carrega cidade/UF pro humano ver.

---

## Task A4: Webhook `POST /api/inbound/gpt-maker`

Valida `X-Internal-Secret` (padrão de `app/api/messaging/ai/process/route.ts`, timing-safe) → enrich → conflito → cria deal em "Pré-qualificado".

**Files:** Create `app/api/inbound/gpt-maker/route.ts` · Test `test/api/inbound-gpt-maker.test.ts`

- [ ] **Passo 1: Escrever o teste que falha**

```ts
// test/api/inbound-gpt-maker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createStaticAdminClient: () => ({
    from: (table: string) => {
      if (table === 'boards') return { select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: { id: 'board-1' } }) }) }) }) };
      if (table === 'board_stages') return { select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: { id: 'stage-preq' } }) }) }) }) };
      return { insert: (row: unknown) => { insertMock(row); return { select: () => ({ single: async () => ({ data: { id: 'deal-1' }, error: null }) }) }; } };
    },
  }),
}));
vi.mock('@/lib/inbound/cnpj', () => ({ enrichCnpj: async () => ({ fitSortimento: true, cnpjValido: true, razaoSocial: 'X', capitalSocial: 1, nomeFantasia: null, cnaePrincipal: null, cnaeDescricao: null, dataInicioAtividade: null, nFiliais: null }) }));
vi.mock('@/lib/inbound/conflito', () => ({ checkConflito: async () => ({ jaCliente: true, escritorio: 'REP GO', ultimoPedido: '2026-05-10' }) }));

import { POST } from '@/app/api/inbound/gpt-maker/route';

function req(body: unknown, secret?: string) {
  return new Request('http://x/api/inbound/gpt-maker', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret ? { 'x-internal-secret': secret } : {}) },
    body: JSON.stringify(body),
  });
}
const LEAD = { nomeLoja: 'Pesca Sul', cidade: 'Goiânia', uf: 'GO', cnpj: '12345678000199', sortimento: 'caça e pesca', marcas: 'Nautika', contatoNome: 'Zé', contatoWhatsapp: '5562999', transcript: '...', adReferral: 'ad-42' };

beforeEach(() => { insertMock.mockClear(); vi.stubEnv('INTERNAL_API_SECRET', 's3cr3t'); });

describe('POST /api/inbound/gpt-maker', () => {
  it('401 sem secret', async () => {
    const r = await POST(req(LEAD));
    expect(r.status).toBe(401);
  });
  it('400 sem cnpj', async () => {
    const r = await POST(req({ ...LEAD, cnpj: '' }, 's3cr3t'));
    expect(r.status).toBe(400);
  });
  it('cria deal em Pré-qualificado com porte + flag de conflito', async () => {
    const r = await POST(req(LEAD, 's3cr3t'));
    expect(r.status).toBe(200);
    const row = insertMock.mock.calls[0][0];
    expect(row.board_id).toBe('board-1');
    expect(row.stage_id).toBe('stage-preq');
    expect(row.title).toBe('Pesca Sul');
    expect(row.custom_fields.conflito.jaCliente).toBe(true);
    expect(row.custom_fields.porte.fitSortimento).toBe(true);
    expect(row.custom_fields.ad_referral).toBe('ad-42');
    expect(row.tags).toContain('conflito');
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npm run test:run -- test/api/inbound-gpt-maker.test.ts`
Expected: FAIL (rota não existe).

- [ ] **Passo 3: Implementar**

```ts
// app/api/inbound/gpt-maker/route.ts
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { enrichCnpj } from '@/lib/inbound/cnpj';
import { checkConflito } from '@/lib/inbound/conflito';
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

  const cnpj = (body.cnpj || '').replace(/\D/g, '');
  if (cnpj.length !== 14 || !body.nomeLoja) {
    return NextResponse.json({ error: 'cnpj e nomeLoja obrigatórios' }, { status: 400 });
  }

  const [porte, conflito] = await Promise.all([enrichCnpj(cnpj), checkConflito(cnpj)]);

  const supabase = createStaticAdminClient();
  const { data: board } = await supabase.from('boards').select('id')
    .eq('key', 'inbound-caca-pesca').eq('organization_id', ORG).single();
  if (!board) return NextResponse.json({ error: 'board não encontrado' }, { status: 500 });
  const { data: stage } = await supabase.from('board_stages').select('id')
    .eq('board_id', board.id).eq('name', 'Pré-qualificado').single();

  const tags: string[] = ['inbound', 'caca-pesca'];
  if (conflito.jaCliente) tags.push('conflito');
  if (!porte.fitSortimento) tags.push('sem-fit');

  const { data: deal, error } = await supabase.from('deals').insert({
    organization_id: ORG, owner_id: OWNER,
    title: body.nomeLoja, value: 0, status: 'open', priority: 'medium',
    board_id: board.id, stage_id: stage?.id ?? null,
    tags,
    custom_fields: {
      origem: 'inbound-caca-pesca', cnpj,
      cidade: body.cidade ?? null, uf: body.uf ?? null,
      sortimento: body.sortimento ?? null, marcas: body.marcas ?? null,
      contato_nome: body.contatoNome ?? null, contato_whatsapp: body.contatoWhatsapp ?? null,
      ad_referral: body.adReferral ?? null, transcript: body.transcript ?? null,
      porte, conflito,
    },
  }).select('id').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, dealId: deal.id });
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npm run test:run -- test/api/inbound-gpt-maker.test.ts`
Expected: PASS (3 testes).

- [ ] **Passo 5: Rodar a suíte + typecheck**

Run: `npm run test:run && npx tsc --noEmit`
Expected: verde.

- [ ] **Passo 6: Commit**

```bash
git add app/api/inbound/gpt-maker/route.ts test/api/inbound-gpt-maker.test.ts
git commit -m "feat(inbound): webhook /api/inbound/gpt-maker (secret + enrich + conflito -> deal)"
```

---

## Task A5: Smoke real (contra o Maré de produção, dado sintético 🧪)

- [ ] **Passo 1: Deploy** (push pra branch que a Vercel builda, ou `vercel deploy`). Confirmar que `/api/inbound/gpt-maker` responde 401 sem secret.

- [ ] **Passo 2: POST sintético rotulado**

Run (trocar `<SECRET>` e o host):
```bash
curl -s -X POST "https://<host-mare>/api/inbound/gpt-maker" \
  -H "x-internal-secret: <SECRET>" -H "content-type: application/json" \
  -d '{"nomeLoja":"🧪 TESTE Pesca Sul","cidade":"Goiânia","uf":"GO","cnpj":"<um CNPJ real de loja de pesca>","sortimento":"caça e pesca","marcas":"Nautika","contatoNome":"🧪 Teste","contatoWhatsapp":"55629","transcript":"lead sintetico","adReferral":"smoke"}'
```
Expected: `{ ok: true, dealId: ... }`. Conferir o card no board "Inbound Caça&Pesca" (estágio Pré-qualificado) com porte + conflito preenchidos.

- [ ] **Passo 3: Apagar o card sintético** (produção nasce limpa). Registrar no log da sessão.

---

# PARTE B — GPT Maker (🤖 Gabriel)

> Sem código/teste automatizado — é config no SaaS. Cada task tem **critério de aceite no web chat** (não precisa número/Meta). Base: curso "Formação Agentes de I.A com GPT Maker" (módulos 2, 3.10, 4.2).

## Task B1: Criar o agente + personalidade

- [ ] Criar agente "Recepção Caça&Pesca". Personalidade: comercial Macboot, direto, cordial, **português BR**, sem enrolação (curso 2.2).
- [ ] Treinar com contexto: o que é a Macboot, linha outdoor caça/pesca, que o alvo é **lojista** (não consumidor), e a promessa do anúncio (alinhar com Marina). (curso 3.2–3.6, treino por texto).
- **Aceite:** no web chat, o agente se apresenta como Macboot e sabe explicar a linha caça/pesca pro lojista.

## Task B2: Roteiro — entrada separa loja × consumidor

- [ ] Primeira mensagem confirma a promessa do anúncio e pergunta: **"Você tem loja / revende, ou é pra uso próprio?"**
- [ ] Se **consumidor** → responde educado, manda pro e-commerce/onde comprar, **encerra sem passar pro comercial**.
- [ ] Se **lojista** → segue pro gate.
- **Aceite (web chat):** digitar "é pra mim, quero comprar uma bota" → recebe redirect e NÃO pede CNPJ. Digitar "tenho uma loja de pesca" → segue pro P1.

## Task B3: Roteiro — 3 perguntas-gate (porte discreto)

- [ ] P1: "Qual o nome da sua loja e a cidade/UF?"
- [ ] P2: "O que sua loja mais vende hoje — caça e pesca, agro, outdoor, calçado? E trabalha com quais marcas?"
- [ ] P3: "Pra montar teu cadastro de lojista, me passa o CNPJ?"
- [ ] **NUNCA** perguntar volume/pedido mínimo (regra dura — porte é inferido no nosso lado pelo CNPJ).
- **Aceite (web chat):** o agente faz as 3 perguntas na ordem, aceita respostas livres, e **em momento nenhum** pergunta quanto a loja compra.

## Task B4: Ação — chamar o webhook ao qualificar

- [ ] Configurar a "segunda intenção"/ação de API do GPT Maker (curso 5.4/5.5): quando tiver **cidade/UF + CNPJ** coletados, fazer `POST` em `https://<host-mare>/api/inbound/gpt-maker`.
- [ ] Header: `x-internal-secret: <INTERNAL_API_SECRET>` (o segredo que geramos no pré-requisito).
- [ ] Body (JSON) mapeando as variáveis coletadas → campos do `LeadInbound` (nomeLoja, cidade, uf, cnpj, sortimento, marcas, contatoNome, contatoWhatsapp, transcript, adReferral).
- [ ] Após o POST, o agente responde ao lead que um consultor vai continuar (handoff — curso 3.10).
- **Aceite (web chat):** completar uma conversa de lojista fake → o GPT Maker dispara o POST → aparece card no Maré. (validado na Task C1)

---

# PARTE C — Integração ponta-a-ponta (🤝 juntos)

## Task C1: Simulação completa com dado sintético 🧪

- [ ] 🤝 No web chat do GPT Maker, rodar 3 conversas sintéticas rotuladas:
  1. **Lojista fit + CNPJ de loja de pesca** → card em Pré-qualificado, `porte.fitSortimento=true`.
  2. **Lojista já-cliente** (CNPJ que existe na carteira) → card com tag `conflito` + escritório no card.
  3. **Consumidor** → redirect, **nenhum** card criado.
- [ ] Conferir cada card no board do Maré (dados + transcrição + ad_referral + porte + conflito).
- [ ] Apagar os cards sintéticos. Produção nasce limpa.
- **Aceite:** os 3 caminhos batem o esperado. **Aí a Fase 0 fecha** — sem número/Meta, prova que o funil funciona.

---

## Self-review (cobertura vs spec)

- ✅ Board com estágios do spec (Novo/Pré-qualificado/Com o Closer/Ganho/Perdido) — A1. *(Descartado-consumidor: o GPT Maker redireciona e não cria card — analytics de consumidor ficam no dashboard do GPT Maker, não sujam o board. Divergência consciente do balde do spec, a favor da simplicidade.)*
- ✅ Gate CNPJ+cidade+fit — A2/A4 (fit via CNAE) + B3.
- ✅ Porte inferido discreto — A2 (CNPJ) + B3 (não pergunta volume).
- ✅ Conflito detecta-e-sinaliza — A3/A4 (tag + custom_fields). ⚠ Território-por-cidade adiado pra Fase 1 (flag honesto na A3).
- ✅ Handoff com transcrição + ad referral — A4 (custom_fields) + B4.
- ✅ Sem depender da Meta — tudo no web chat + smoke por curl.
- ✅ Anti-ban / API oficial — é Fase 1 (número). Fase 0 não toca WhatsApp real.

**Fora de escopo da Fase 0 (Fase 1):** número + Cloud API oficial + verificação BM; CAPI; território-por-cidade; estágio "Passar pro Rep".

---
*Criado: 2026-07-20 — sessão CLI Zuca. Spec: `docs/2026-07-20-inbound-caca-pesca-whatsapp-crm-design.md`.*

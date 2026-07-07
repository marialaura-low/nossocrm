// Sync (espelho): funil do portal dos representantes (negocios) -> Macboot CRM (deals).
// O PORTAL é fonte de verdade do funil; o CRM só reflete. Full-refresh dos deals de origem-portal.
// Idempotente: pode rodar quantas vezes quiser (dá pra virar cron).
//
// Uso: node scripts/sync-funil-portal.mjs

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(resolve(root, '.env.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const SRC_URL = 'https://cvqczrciitcteabvonmw.supabase.co';
const SRC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2cWN6cmNpaXRjdGVhYnZvbm13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMzA3NjUsImV4cCI6MjA4OTcwNjc2NX0.ragI39kB6DJJsdTY8ugTT1eLTql0KtOreSvsDxVrgU4';
const DST_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const DST_KEY = env.SUPABASE_SECRET_KEY;
const ORG = '171ea789-b0e9-43fa-8e24-ca685057b617';
const OWNER = 'c08dbd94-14ef-42fe-97f4-500dee3628b0';

// mapa portal -> CRM (dos boards criados)
const BOARD = {
  1: '166cf46c-8d9c-4455-b755-0b3d79e993ba', // Pós-venda
  2: 'd004dba6-1d18-47fa-a667-142b342da8f6', // Reativação
};
const STAGE = {
  1: '4714f7a9-e2fe-48d2-a0ea-22d68e4a94f3', // Chegou bem?
  2: 'aeda019e-93d4-4879-9ecc-de75c4a7bf68', // Apoio
  3: '761e62c9-ce63-420e-9403-f5f9d7743ae5', // Giro & reposição
  4: '35e7b39e-b57e-4061-9776-05fc8d681c8c', // Diagnóstico
  5: '265e3b0b-e04e-4e71-a867-5d98c6d2942d', // Detectado
  6: '1284b319-70f6-49d3-9915-9aa8ed86def2', // Contatado
  7: '5767927e-b0b4-445a-813c-0398271b5f68', // Negociando
};

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function srcAll(table, cols, filter) {
  const out = []; const step = 1000;
  for (let from = 0; ; from += step) {
    const r = await fetch(`${SRC_URL}/rest/v1/${table}?select=${cols}${filter ? '&' + filter : ''}`, {
      headers: { apikey: SRC_KEY, Authorization: `Bearer ${SRC_KEY}`, Range: `${from}-${from + step - 1}` },
    });
    if (!r.ok) throw new Error(`SRC ${table} ${r.status} ${await r.text()}`);
    const rows = await r.json(); out.push(...rows);
    if (rows.length < step) break;
  }
  return out;
}
async function dstAll(table, cols, filter) {
  const out = []; const step = 1000;
  for (let from = 0; ; from += step) {
    const r = await fetch(`${DST_URL}/rest/v1/${table}?select=${cols}${filter ? '&' + filter : ''}`, {
      headers: { apikey: DST_KEY, Authorization: `Bearer ${DST_KEY}`, Range: `${from}-${from + step - 1}` },
    });
    if (!r.ok) throw new Error(`DST GET ${table} ${r.status} ${await r.text()}`);
    const rows = await r.json(); out.push(...rows);
    if (rows.length < step) break;
  }
  return out;
}
async function dst(method, path, body, prefer) {
  const headers = { apikey: DST_KEY, Authorization: `Bearer ${DST_KEY}`, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${DST_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`DST ${method} ${path} ${r.status} ${await r.text()}`);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}

async function main() {
  log('Sync funil portal -> CRM (início)');

  // 1) negócios abertos do portal
  const negocios = await srcAll('negocios', 'id,cliente_chave,escritorio,funil_id,etapa_id,status,pedido_na_casa,estagnado,valor_referencia,aberto_em,proxima_acao_em', 'status=eq.aberto');
  log(`Negócios abertos no portal: ${negocios.length}`);

  // 2) mapa de empresas no CRM (name -> id); cria as que faltam
  const companyMap = new Map();
  for (const c of await dstAll('crm_companies', 'id,name')) companyMap.set(c.name, c.id);
  const faltantes = [...new Set(negocios.map((n) => n.cliente_chave).filter((m) => m && !companyMap.has(m)))];
  for (let i = 0; i < faltantes.length; i += 200) {
    const chunk = faltantes.slice(i, i + 200).map((m) => ({ name: m, owner_id: OWNER, organization_id: ORG }));
    for (const c of await dst('POST', 'crm_companies', chunk, 'return=representation')) companyMap.set(c.name, c.id);
  }
  if (faltantes.length) log(`Empresas criadas p/ negócios sem cadastro: ${faltantes.length}`);

  // 3) FULL REFRESH: apaga deals de origem-portal e recria
  const antigos = await dstAll('deals', 'id,custom_fields', 'custom_fields->>portal_negocio_id=not.is.null');
  if (antigos.length) {
    for (let i = 0; i < antigos.length; i += 100) {
      const ids = antigos.slice(i, i + 100).map((d) => d.id).join(',');
      await dst('DELETE', `deals?id=in.(${ids})`);
    }
    log(`Deals de sync anteriores removidos: ${antigos.length}`);
  }

  // 4) insere os deals atuais
  let ok = 0, semStage = 0;
  const rows = [];
  for (const n of negocios) {
    const stage_id = STAGE[n.etapa_id]; const board_id = BOARD[n.funil_id];
    if (!stage_id || !board_id) { semStage++; continue; }
    rows.push({
      title: n.cliente_chave || `Negócio ${n.id}`,
      value: n.valor_referencia ? Number(n.valor_referencia) : 0,
      status: 'open', board_id, stage_id,
      client_company_id: companyMap.get(n.cliente_chave) || null,
      is_won: false, is_lost: false,
      last_stage_change_date: n.aberto_em || null,
      custom_fields: {
        portal_negocio_id: n.id, escritorio: n.escritorio, funil_id: n.funil_id,
        pedido_na_casa: !!n.pedido_na_casa, estagnado: !!n.estagnado,
        proxima_acao_em: n.proxima_acao_em || null,
      },
      owner_id: OWNER, organization_id: ORG,
    });
  }
  for (let i = 0; i < rows.length; i += 200) {
    await dst('POST', 'deals', rows.slice(i, i + 200));
    ok += Math.min(200, rows.length - i);
  }

  log(`Deals inseridos: ${ok}${semStage ? ` · pulados (etapa/funil desconhecido): ${semStage}` : ''}`);
  log('Sync FIM');
}

main().catch((e) => { console.error('ERRO FATAL:', e.message); process.exit(1); });

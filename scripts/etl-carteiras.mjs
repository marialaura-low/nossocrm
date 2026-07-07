// ETL: carteiras do portal dos representantes (Macboot) -> NossoCRM.
// Lê a origem (Supabase Macboot) via anon key e escreve no destino (NossoCRM) via secret key.
// Idempotente por escritório: se o board "Carteira <label> — Pós-venda" já existe, pula.
// Resolve client_company_id no insert (sem passo de linkagem). Grava source='portal-rep:<escritorio>'
// em cada contato = gancho pra atribuir a carteira ao usuário do rep depois.
//
// Uso: node scripts/etl-carteiras.mjs
// (Lê SUPABASE_SECRET_KEY do .env.local.)

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

if (!DST_KEY) { console.error('FALTA SUPABASE_SECRET_KEY no .env.local'); process.exit(1); }

const SKIP_ESCRITORIO = new Set(['ANDERSON PEREIRA SILVA ME']); // já carregado

const STAGES = [
  { name: 'Chegou bem?', color: 'bg-blue-500', is_default: true, order: 1 },
  { name: 'Apoio', color: 'bg-indigo-500', is_default: false, order: 2 },
  { name: 'Giro & reposição', color: 'bg-amber-500', is_default: false, order: 3 },
  { name: 'Diagnóstico', color: 'bg-emerald-500', is_default: false, order: 4 },
];

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function src(path) {
  const r = await fetch(`${SRC_URL}/rest/v1/${path}`, {
    headers: { apikey: SRC_KEY, Authorization: `Bearer ${SRC_KEY}` },
  });
  if (!r.ok) throw new Error(`SRC ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function dst(method, path, body, prefer) {
  const headers = { apikey: DST_KEY, Authorization: `Bearer ${DST_KEY}`, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${DST_URL}/rest/v1/${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`DST ${method} ${path} -> ${r.status} ${await r.text()}`);
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

// paginação da origem
async function srcAll(table, cols, filter) {
  const out = [];
  const step = 1000;
  for (let from = 0; ; from += step) {
    const r = await fetch(`${SRC_URL}/rest/v1/${table}?select=${cols}${filter ? '&' + filter : ''}`, {
      headers: { apikey: SRC_KEY, Authorization: `Bearer ${SRC_KEY}`, Range: `${from}-${from + step - 1}` },
    });
    if (!r.ok) throw new Error(`SRC ${table} -> ${r.status} ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < step) break;
  }
  return out;
}

const LABELS = {
  'B2B SIM': 'B2B SIM',
  'GREEN SHOES REPRESENTACAO COMERCIAL LTDA': 'Green Shoes',
  'REP GO REPRESENTACAO COMERCIAL LTDA': 'Rep Go',
  'LAURA PADUA REPRESENTACAO  COM. LTDA': 'Laura Pádua',
  'ALEXANDRE MARCOS PEREIRA FRANCA ME': 'Alexandre',
  'B A J REPRESENTACOES COMERCIAIS LTDA': 'B A J',
  'ANCARF REPRESENTACOES COMERCIAIS EIRELI': 'Ancarf',
  'CETEL REPRESENTACAO COMERCIAL DE CALCADO': 'Cetel',
  'SL COMERCIO E REPRESENTACAO DE ARTIGOS': 'SL Artigos',
  "JD' LUCA LTDA": 'JD Luca',
  'MORAIS REPRESENTACOES LTDA': 'Morais',
  'MARTINS REPRESENTACOES DE FRANCA LTDA ME': 'Martins',
  'PXG GLOBAL COMERCIO E SERVICOS LTDA': 'PXG',
  'LUCIANO RIOS DE ALMEIDA REPRESENTACOES': 'Luciano',
  'JOSE PEREIRA MARINHO': 'José Marinho',
  'G V F MATOS REPRESENTACOES': 'Matos',
  'FRANCISCHINI REPRESENTACOES LTDA': 'Francischini',
  MACBOOT: 'Macboot (interno)',
};
function label(escritorio) {
  return LABELS[escritorio] || escritorio.split(' ').slice(0, 2)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

const notesOf = (l) => [
  [l.cidade, l.uf].filter(Boolean).join('/'),
  l.cnpj, l.endereco, l.bairro, l.situacao_jrti,
].filter(Boolean).join(' | ') || null;

async function main() {
  log('Início ETL carteiras');

  // 1) mapa nicho por matriz (clientes: ~200 linhas)
  const clientes = await srcAll('clientes', 'nome_macboot,nicho');
  const nichoOf = new Map(clientes.map((c) => [c.nome_macboot, c.nicho]));

  // 2) mapa de empresas já existentes no destino (name -> id)
  const companyMap = new Map();
  for (const c of await srcAllDst('crm_companies', 'id,name')) companyMap.set(c.name, c.id);
  log(`Empresas já no destino: ${companyMap.size}`);

  // 3) escritórios da origem
  const lojasEscr = await srcAll('lojas', 'escritorio');
  let escritorios = [...new Set(lojasEscr.map((x) => x.escritorio))].filter((e) => e && !SKIP_ESCRITORIO.has(e));
  if (process.env.ETL_ONLY) escritorios = escritorios.filter((e) => e === process.env.ETL_ONLY);
  log(`Escritórios a carregar: ${escritorios.length}`);

  // boards já existentes (idempotência)
  const boards = await srcAllDst('boards', 'id,name');
  const boardNames = new Set(boards.map((b) => b.name));

  const resumo = [];
  for (const escr of escritorios) {
    const boardName = `Carteira ${label(escr)} — Pós-venda`;
    if (boardNames.has(boardName)) { log(`PULA (já existe board): ${boardName}`); continue; }

    const lojas = await srcAll('lojas', '*', `escritorio=eq.${encodeURIComponent(escr)}`);
    if (!lojas.length) { log(`sem lojas: ${escr}`); continue; }

    // 3a) empresas faltantes (matrizes distintas)
    const matrizes = [...new Set(lojas.map((l) => l.cliente_chave).filter(Boolean))];
    const novas = matrizes.filter((m) => !companyMap.has(m));
    for (let i = 0; i < novas.length; i += 200) {
      const chunk = novas.slice(i, i + 200).map((m) => ({
        name: m, industry: nichoOf.get(m) || null, owner_id: OWNER, organization_id: ORG,
      }));
      const created = await dst('POST', 'crm_companies', chunk, 'return=representation');
      for (const c of created) companyMap.set(c.name, c.id);
    }

    // 3b) board + estágios
    const [board] = await dst('POST', 'boards', [{
      name: boardName, description: `Carteira pós-venda — ${escr} (portal dos representantes).`,
      type: 'SALES', is_default: false, position: 0, owner_id: OWNER, organization_id: ORG,
    }], 'return=representation');
    await dst('POST', 'board_stages', STAGES.map((s) => ({
      board_id: board.id, name: s.name, label: s.name, color: s.color,
      order: s.order, is_default: s.is_default, organization_id: ORG,
    })));

    // 3c) contatos (com FK resolvido + source do escritório)
    const source = `portal-rep:${escr}`;
    let inseridos = 0;
    for (let i = 0; i < lojas.length; i += 200) {
      const chunk = lojas.slice(i, i + 200).map((l) => ({
        name: l.nome, email: l.email || null, phone: l.telefone || null,
        company_name: l.cliente_chave, client_company_id: companyMap.get(l.cliente_chave) || null,
        notes: notesOf(l), source, status: 'ACTIVE', stage: 'CUSTOMER',
        owner_id: OWNER, organization_id: ORG,
      }));
      await dst('POST', 'contacts', chunk);
      inseridos += chunk.length;
    }
    boardNames.add(boardName);
    log(`OK ${label(escr)}: ${matrizes.length} matrizes (${novas.length} novas) · ${inseridos} contatos`);
    resumo.push({ escritorio: escr, board: boardName, matrizes: matrizes.length, contatos: inseridos });
  }

  log('=== RESUMO ===');
  for (const r of resumo) log(`${r.board}: ${r.matrizes} matrizes · ${r.contatos} contatos`);
  log(`Total escritórios carregados: ${resumo.length}`);
  log('FIM');
}

// leitura paginada do destino
async function srcAllDst(table, cols, filter) {
  const out = [];
  const step = 1000;
  for (let from = 0; ; from += step) {
    const r = await fetch(`${DST_URL}/rest/v1/${table}?select=${cols}${filter ? '&' + filter : ''}`, {
      headers: { apikey: DST_KEY, Authorization: `Bearer ${DST_KEY}`, Range: `${from}-${from + step - 1}` },
    });
    if (!r.ok) throw new Error(`DST GET ${table} -> ${r.status} ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < step) break;
  }
  return out;
}

main().catch((e) => { console.error('ERRO FATAL:', e.message); process.exit(1); });

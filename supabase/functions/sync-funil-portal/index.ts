// Edge Function: espelha o funil do portal dos representantes (negocios) -> Macboot CRM (deals+activities).
// Fonte de verdade = portal. Full-refresh idempotente. Disparada por pg_cron (após o motor do portal).
//
// Env automáticos no edge runtime: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (projeto do CRM).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SRC_URL = "https://cvqczrciitcteabvonmw.supabase.co";
const SRC_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2cWN6cmNpaXRjdGVhYnZvbm13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMzA3NjUsImV4cCI6MjA4OTcwNjc2NX0.ragI39kB6DJJsdTY8ugTT1eLTql0KtOreSvsDxVrgU4";
const DST_URL = Deno.env.get("SUPABASE_URL")!;
const DST_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORG = "171ea789-b0e9-43fa-8e24-ca685057b617";
const OWNER = "c08dbd94-14ef-42fe-97f4-500dee3628b0";

const BOARD: Record<number, string> = {
  1: "166cf46c-8d9c-4455-b755-0b3d79e993ba", // Pós-venda
  2: "d004dba6-1d18-47fa-a667-142b342da8f6", // Reativação
};
const STAGE: Record<number, string> = {
  1: "4714f7a9-e2fe-48d2-a0ea-22d68e4a94f3", 2: "aeda019e-93d4-4879-9ecc-de75c4a7bf68",
  3: "761e62c9-ce63-420e-9403-f5f9d7743ae5", 4: "35e7b39e-b57e-4061-9776-05fc8d681c8c",
  5: "265e3b0b-e04e-4e71-a867-5d98c6d2942d", 6: "1284b319-70f6-49d3-9915-9aa8ed86def2",
  7: "5767927e-b0b4-445a-813c-0398271b5f68",
};

async function srcAll(table: string, cols: string, filter?: string) {
  const out: any[] = []; const step = 1000;
  for (let from = 0; ; from += step) {
    const r = await fetch(`${SRC_URL}/rest/v1/${table}?select=${cols}${filter ? "&" + filter : ""}`, {
      headers: { apikey: SRC_KEY, Authorization: `Bearer ${SRC_KEY}`, Range: `${from}-${from + step - 1}` },
    });
    if (!r.ok) throw new Error(`SRC ${table} ${r.status} ${await r.text()}`);
    const rows = await r.json(); out.push(...rows);
    if (rows.length < step) break;
  }
  return out;
}
async function dstAll(table: string, cols: string, filter?: string) {
  const out: any[] = []; const step = 1000;
  for (let from = 0; ; from += step) {
    const r = await fetch(`${DST_URL}/rest/v1/${table}?select=${cols}${filter ? "&" + filter : ""}`, {
      headers: { apikey: DST_KEY, Authorization: `Bearer ${DST_KEY}`, Range: `${from}-${from + step - 1}` },
    });
    if (!r.ok) throw new Error(`DST GET ${table} ${r.status} ${await r.text()}`);
    const rows = await r.json(); out.push(...rows);
    if (rows.length < step) break;
  }
  return out;
}
async function dst(method: string, path: string, body?: any, prefer?: string) {
  const headers: Record<string, string> = { apikey: DST_KEY, Authorization: `Bearer ${DST_KEY}`, "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${DST_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`DST ${method} ${path} ${r.status} ${await r.text()}`);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}

async function sync() {
  const negocios = await srcAll("negocios", "id,cliente_chave,escritorio,funil_id,etapa_id,status,pedido_na_casa,estagnado,valor_referencia,aberto_em,proxima_acao_em", "status=eq.aberto");

  const companyMap = new Map<string, string>();
  for (const c of await dstAll("crm_companies", "id,name")) companyMap.set(c.name, c.id);
  const faltantes = [...new Set(negocios.map((n) => n.cliente_chave).filter((m: string) => m && !companyMap.has(m)))];
  for (let i = 0; i < faltantes.length; i += 200) {
    const chunk = (faltantes.slice(i, i + 200) as string[]).map((m) => ({ name: m, owner_id: OWNER, organization_id: ORG }));
    for (const c of await dst("POST", "crm_companies", chunk, "return=representation")) companyMap.set(c.name, c.id);
  }

  await dst("DELETE", `activities?description=eq.sync:portal&organization_id=eq.${ORG}`);
  const antigos = await dstAll("deals", "id", "custom_fields->>portal_negocio_id=not.is.null");
  for (let i = 0; i < antigos.length; i += 100) {
    const ids = antigos.slice(i, i + 100).map((d) => d.id).join(",");
    await dst("DELETE", `deals?id=in.(${ids})`);
  }

  const rows: any[] = [];
  for (const n of negocios) {
    const stage_id = STAGE[n.etapa_id]; const board_id = BOARD[n.funil_id];
    if (!stage_id || !board_id) continue;
    rows.push({
      title: n.cliente_chave || `Negócio ${n.id}`, value: n.valor_referencia ? Number(n.valor_referencia) : 0,
      status: "open", board_id, stage_id, client_company_id: companyMap.get(n.cliente_chave) || null,
      is_won: false, is_lost: false, last_stage_change_date: n.aberto_em || null,
      custom_fields: { portal_negocio_id: n.id, escritorio: n.escritorio, funil_id: n.funil_id, pedido_na_casa: !!n.pedido_na_casa, estagnado: !!n.estagnado, proxima_acao_em: n.proxima_acao_em || null },
      owner_id: OWNER, organization_id: ORG,
    });
  }
  const criados: any[] = [];
  for (let i = 0; i < rows.length; i += 200) criados.push(...(await dst("POST", "deals", rows.slice(i, i + 200), "return=representation") || []));

  const ativs = criados.filter((d) => d.custom_fields?.proxima_acao_em).map((d) => ({
    title: "Próxima ação (portal)", type: "CALL", date: `${d.custom_fields.proxima_acao_em}T12:00:00-03:00`,
    completed: false, description: "sync:portal", deal_id: d.id, client_company_id: d.client_company_id || null,
    owner_id: OWNER, organization_id: ORG,
  }));
  for (let i = 0; i < ativs.length; i += 200) await dst("POST", "activities", ativs.slice(i, i + 200));

  // Lei do pedido na casa vale em TODO board (spec união §3, ponte 1):
  // cliente emitiu pedido nos últimos 8d → deal aberto dele em board HUMANO fecha como ganho.
  const corte = new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10);
  const emissores = new Set(
    (await srcAll("sell_in", "cliente_matriz", `data_emissao=gte.${corte}`))
      .map((r: any) => r.cliente_matriz).filter(Boolean)
  );
  const boardsHumanos = (await dstAll("boards", "id,regido_por"))
    .filter((b: any) => b.regido_por !== "motor").map((b: any) => b.id);
  const nomePorId = new Map(
    (await dstAll("crm_companies", "id,name")).map((c: any) => [c.id, c.name])
  );
  const abertos = (await dstAll("deals", "id,client_company_id,board_id", "is_won=eq.false&is_lost=eq.false"))
    .filter((d: any) => boardsHumanos.includes(d.board_id) && emissores.has(nomePorId.get(d.client_company_id)));
  let ganhosAuto = 0;
  for (const d of abertos) {
    await dst("PATCH", `deals?id=eq.${d.id}`, { is_won: true, closed_at: new Date().toISOString() }, "return=minimal");
    await dst("POST", "activities", [{
      title: "Ganho automático: pedido na casa (lei do pedido)", type: "TASK",
      date: new Date().toISOString(), completed: true, description: "sync:lei-pedido-na-casa",
      deal_id: d.id, client_company_id: d.client_company_id, owner_id: OWNER, organization_id: ORG,
    }], "return=minimal");
    ganhosAuto++;
  }

  return { negocios: negocios.length, deals: criados.length, atividades: ativs.length, empresas_criadas: faltantes.length, ganhos_auto: ganhosAuto };
}

Deno.serve(async (req: Request) => {
  // guard: exige x-sync-secret == sync_config.sync_secret (env de função não setável nesta infra)
  const provided = req.headers.get("x-sync-secret") ?? "";
  let expected = "";
  try {
    const rows = await dstAll("sync_config", "value", "key=eq.sync_secret");
    expected = rows?.[0]?.value ?? "";
  } catch (_) { /* se a tabela sumir, cai no 401 abaixo */ }
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  try {
    const res = await sync();
    return new Response(JSON.stringify({ ok: true, ...res }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});

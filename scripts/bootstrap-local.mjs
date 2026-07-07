// Bootstrap local do NossoCRM — cria organização + usuário admin no Supabase.
// Usa a mesma lógica idempotente do instalador oficial (lib/installer/supabase.ts).
//
// Uso:
//   node scripts/bootstrap-local.mjs "Nome da Empresa" email@dominio.com "senha-forte"
//
// Requer SUPABASE_SECRET_KEY preenchida no .env.local.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(resolve(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

const [companyName, email, password] = process.argv.slice(2);

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERRO: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY precisam estar no .env.local');
  process.exit(1);
}
if (!companyName || !email || !password) {
  console.error('Uso: node scripts/bootstrap-local.mjs "Nome da Empresa" email@dominio.com "senha-forte"');
  process.exit(1);
}
if (password.length < 8) {
  console.error('ERRO: senha precisa de pelo menos 8 caracteres');
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const emailNorm = email.trim().toLowerCase();

// 1) Organization (reusa se já existir)
const { data: existingOrgs, error: orgCheckError } = await admin.from('organizations').select('id').limit(1);
if (orgCheckError) throw new Error(`organizations: ${orgCheckError.message}`);

let organizationId = existingOrgs?.[0]?.id || null;
if (!organizationId) {
  const { data: org, error } = await admin.from('organizations').insert({ name: companyName }).select('id').single();
  if (error || !org?.id) throw new Error(`criar organization: ${error?.message}`);
  organizationId = org.id;
  console.log(`✓ organization criada: ${organizationId}`);
} else {
  console.log(`✓ organization existente reusada: ${organizationId}`);
}

// 2) Auth user (cria ou atualiza senha)
let userId = null;
{
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  userId = (data?.users || []).find((u) => (u.email || '').toLowerCase() === emailNorm)?.id || null;
}

if (!userId) {
  const { data, error } = await admin.auth.admin.createUser({
    email: emailNorm,
    password,
    email_confirm: true,
    user_metadata: { role: 'admin', organization_id: organizationId },
  });
  if (error || !data?.user?.id) throw new Error(`criar usuário: ${error?.message}`);
  userId = data.user.id;
  console.log(`✓ usuário admin criado: ${emailNorm}`);
} else {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    user_metadata: { role: 'admin', organization_id: organizationId },
  });
  if (error) throw new Error(`atualizar usuário: ${error.message}`);
  console.log(`✓ usuário existente atualizado: ${emailNorm}`);
}

// 3) Profile upsert
const displayName = emailNorm.split('@')[0] || 'Admin';
const { error: profileError } = await admin.from('profiles').upsert(
  {
    id: userId,
    email: emailNorm,
    name: displayName,
    first_name: displayName,
    organization_id: organizationId,
    role: 'admin',
    updated_at: new Date().toISOString(),
  },
  { onConflict: 'id' }
);
if (profileError) throw new Error(`profile: ${profileError.message}`);

console.log('✓ profile ok');
console.log(`\nPronto. Login em http://localhost:3000/login com ${emailNorm}`);

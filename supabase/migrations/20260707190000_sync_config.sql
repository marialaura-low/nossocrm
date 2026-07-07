-- shared-secret store para a edge sync-funil-portal (env de função não é setável nesta infra).
-- Só o service role (a própria função) lê; RLS sem policy nega anon/authenticated.
create table if not exists public.sync_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.sync_config enable row level security;
-- (sem policies → apenas service role acessa)

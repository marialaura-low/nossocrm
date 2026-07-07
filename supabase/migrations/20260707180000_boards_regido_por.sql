-- Migration: regido_por em boards
-- Governa se o board é espelho de um motor externo (drag desabilitado, Tasks 5/6)
-- ou kanban manual operado por humano (padrão).

alter table public.boards add column if not exists regido_por text not null default 'humano'
  check (regido_por in ('motor','humano'));
update public.boards set regido_por = 'motor'
 where id in ('166cf46c-8d9c-4455-b755-0b3d79e993ba',  -- Pós-venda (espelho)
              'd004dba6-1d18-47fa-a667-142b342da8f6'); -- Reativação (espelho)

-- Tactics Ledger cloud sync. Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- One row per user holding their whole ledger as JSON. Row Level Security means a signed-in
-- user can only ever read or write their own row; nobody else (not even other users of this
-- project) can see it through the API.

create table if not exists public.ledger_state (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb       not null,
  version    bigint      not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.ledger_state enable row level security;

drop policy if exists "own row: read"   on public.ledger_state;
drop policy if exists "own row: insert" on public.ledger_state;
drop policy if exists "own row: update" on public.ledger_state;
drop policy if exists "own row: delete" on public.ledger_state;

create policy "own row: read"   on public.ledger_state for select to authenticated using (auth.uid() = user_id);
create policy "own row: insert" on public.ledger_state for insert to authenticated with check (auth.uid() = user_id);
create policy "own row: update" on public.ledger_state for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row: delete" on public.ledger_state for delete to authenticated using (auth.uid() = user_id);

-- The anonymous (signed-out) role gets nothing.
revoke all on public.ledger_state from anon;
grant select, insert, update, delete on public.ledger_state to authenticated;

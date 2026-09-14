-- Run this once in your Supabase project's SQL editor.
--
-- One table holds every signed-in player's progress, shaped to mirror
-- src/store/persist.ts's own local envelope exactly: `state` ends up looking
-- like { "profile": {...}, "collection": {...}, "decks": {...},
-- "economy": {...}, "missions": {...}, "story": {...} } — one key per
-- existing localStorage key, so none of the six stores that already save
-- through persist.ts need to change shape.

create table if not exists player_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table player_saves enable row level security;

create policy "Users manage their own save"
  on player_saves
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Atomic partial merge: `state = state || patch` means pushing one store's
-- data (say, a fresh `economy` save after a pack opens) never clobbers
-- another store's data (say, `decks`) sitting in the same row that this
-- particular save didn't touch. `security definer` plus the `auth.uid()`
-- read from inside the function (never trusting a caller-supplied user id)
-- is what keeps this safe to expose to any signed-in caller: it can only
-- ever write the row belonging to whoever is currently authenticated.
create or replace function merge_player_state(patch jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into player_saves (user_id, state)
  values (auth.uid(), patch)
  on conflict (user_id)
  do update set state = player_saves.state || excluded.state, updated_at = now();
$$;

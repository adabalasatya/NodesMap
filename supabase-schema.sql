-- NoteFlow schema (with auth + per-user RLS)
-- 1. Open Supabase → SQL Editor → New query
-- 2. Paste this entire file and click "Run"
-- 3. Then: Authentication → Providers → enable Google (optional)
--    and Authentication → Sign In / Up → toggle "Confirm email" off
--    if you want instant sign-up without an email round-trip.

create extension if not exists "pgcrypto";

-- ====================================================================
-- folders
-- ====================================================================
create table if not exists public.folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  color       text not null default '#3b82f6',
  emoji       text,
  parent_id   uuid references public.folders(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- backfill columns for projects that ran the older schema
alter table public.folders
  add column if not exists parent_id uuid references public.folders(id) on delete cascade;
alter table public.folders
  add column if not exists emoji text;

-- length sanity (DO blocks so re-running won't error)
do $$ begin
  alter table public.folders
    add constraint folders_name_len check (
      char_length(name) > 0 and char_length(name) <= 200
    );
exception when duplicate_object then null; end $$;

-- ====================================================================
-- files
-- ====================================================================
create table if not exists public.files (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  folder_id     uuid not null references public.folders(id) on delete cascade,
  title         text not null,
  content       text not null default '',
  is_completed  boolean not null default false,
  updated_at    timestamptz not null default now()
);

do $$ begin
  alter table public.files
    add constraint files_title_len check (
      char_length(title) > 0 and char_length(title) <= 240
    );
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.files
    add constraint files_content_len check (char_length(content) <= 5000000);
exception when duplicate_object then null; end $$;

-- ====================================================================
-- tasks (planner — previously local-only)
-- ====================================================================
create table if not exists public.tasks (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  title                  text not null,
  start_date             date not null,
  time                   text,
  repeat                 text not null default 'once',
  weekdays               smallint[] not null default '{}',
  linked_file_id         uuid references public.files(id)   on delete set null,
  linked_folder_id       uuid references public.folders(id) on delete set null,
  completed_dates        date[] not null default '{}',
  auto_completed_dates   date[] not null default '{}',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

do $$ begin
  alter table public.tasks
    add constraint tasks_title_len check (
      char_length(title) > 0 and char_length(title) <= 240
    );
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.tasks
    add constraint tasks_repeat_kind check (repeat in ('once','daily','weekly'));
exception when duplicate_object then null; end $$;

-- ====================================================================
-- indexes
-- ====================================================================
create index if not exists folders_user_id_idx   on public.folders(user_id);
create index if not exists files_user_id_idx     on public.files(user_id);
create index if not exists files_folder_id_idx   on public.files(folder_id);
create index if not exists tasks_user_id_idx     on public.tasks(user_id);
create index if not exists tasks_start_date_idx  on public.tasks(start_date);

-- ====================================================================
-- RLS
-- ====================================================================
alter table public.folders enable row level security;
alter table public.files   enable row level security;
alter table public.tasks   enable row level security;

drop policy if exists "own_folders_select" on public.folders;
drop policy if exists "own_folders_modify" on public.folders;
drop policy if exists "own_files_select"   on public.files;
drop policy if exists "own_files_modify"   on public.files;
drop policy if exists "own_tasks_select"   on public.tasks;
drop policy if exists "own_tasks_modify"   on public.tasks;

create policy "own_folders_select" on public.folders
  for select using (auth.uid() = user_id);
create policy "own_folders_modify" on public.folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_files_select" on public.files
  for select using (auth.uid() = user_id);
create policy "own_files_modify" on public.files
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_tasks_select" on public.tasks
  for select using (auth.uid() = user_id);
create policy "own_tasks_modify" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ====================================================================
-- updated_at — server-side source of truth.
-- The client can no longer back-date a row to win every merge.
-- ====================================================================
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists files_touch_updated_at on public.files;
create trigger files_touch_updated_at
  before update on public.files
  for each row execute function public.touch_updated_at();

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ====================================================================
-- cross-user integrity: a file's user_id MUST match its folder's user_id.
-- RLS already prevents inserting under another user, but this trigger
-- also guards against mismatched cross-references inside one's own data.
-- ====================================================================
create or replace function public.files_match_folder_owner() returns trigger
language plpgsql as $$
declare
  expected uuid;
begin
  select user_id into expected from public.folders where id = new.folder_id;
  if expected is null then
    raise exception 'Folder % not found', new.folder_id;
  end if;
  if expected <> new.user_id then
    raise exception 'File user_id does not match folder user_id';
  end if;
  return new;
end;
$$;

drop trigger if exists files_match_folder_owner on public.files;
create trigger files_match_folder_owner
  before insert or update on public.files
  for each row execute function public.files_match_folder_owner();

-- ====================================================================
-- Self-service account deletion. Runs as the function owner so it can
-- touch auth.users. Only ever deletes the currently authenticated user.
-- ====================================================================
create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_user() from public;
grant execute on function public.delete_user() to authenticated;

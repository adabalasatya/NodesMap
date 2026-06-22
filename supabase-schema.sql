-- NoteFlow schema (with auth + per-user RLS)
-- 1. Open Supabase → SQL Editor → New query
-- 2. Paste this entire file and click "Run"
-- 3. Then: Authentication → Providers → enable Google (optional)
--    and Authentication → Sign In / Up → toggle "Confirm email" off
--    if you want instant sign-up without an email round-trip.

create extension if not exists "pgcrypto";

create table if not exists public.folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  color       text not null default '#3b82f6',
  created_at  timestamptz not null default now()
);

create table if not exists public.files (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  folder_id     uuid not null references public.folders(id) on delete cascade,
  title         text not null,
  content       text not null default '',
  is_completed  boolean not null default false,
  updated_at    timestamptz not null default now()
);

create index if not exists folders_user_id_idx on public.folders(user_id);
create index if not exists files_user_id_idx   on public.files(user_id);
create index if not exists files_folder_id_idx on public.files(folder_id);

alter table public.folders enable row level security;
alter table public.files   enable row level security;

drop policy if exists "own_folders_select" on public.folders;
drop policy if exists "own_folders_modify" on public.folders;
drop policy if exists "own_files_select"   on public.files;
drop policy if exists "own_files_modify"   on public.files;

create policy "own_folders_select" on public.folders
  for select using (auth.uid() = user_id);
create policy "own_folders_modify" on public.folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_files_select" on public.files
  for select using (auth.uid() = user_id);
create policy "own_files_modify" on public.files
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

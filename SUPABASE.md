# Supabase setup for NoteFlow

This app ships with full local-storage persistence. Follow these steps if you also
want cloud sync, multi-device support, or auth via Supabase.

## 1. Create the project

1. Sign up / log in at [https://supabase.com](https://supabase.com).
2. Click **New project**, give it a name and a strong DB password, pick a region close to you.
3. Wait for provisioning (~1 min).

## 2. Get your keys

In the project dashboard:

- **Settings → API**
  - Copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
  - Copy **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

> The anon key is safe to expose to the browser; row-level security (RLS) is what protects rows.

## 3. Create the schema

Open **SQL Editor → New query** and run:

```sql
create extension if not exists "pgcrypto";

create table public.folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  name        text not null,
  color       text not null default '#3b82f6',
  created_at  timestamptz not null default now()
);

create table public.files (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  folder_id     uuid not null references public.folders(id) on delete cascade,
  title         text not null,
  content       text not null default '',
  is_completed  boolean not null default false,
  updated_at    timestamptz not null default now()
);

-- Row-level security
alter table public.folders enable row level security;
alter table public.files   enable row level security;

create policy "own_folders" on public.folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_files" on public.files
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Helpful index
create index files_folder_id_idx on public.files(folder_id);
```

If you just want a quick demo without auth, swap the policies for `using (true) with check (true)` — but only for local prototyping.

## 4. Install the client

```bash
cd my-work
npm install @supabase/supabase-js
```

## 5. Add environment variables

Create `my-work/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Restart the dev server after creating it.

## 6. Enable the client

Open `app/lib/supabase.ts` and uncomment the implementation block. The file
already contains typed wrappers for:

- `fetchFolders()`, `fetchFiles()`
- `upsertFolder()`, `upsertFile()`
- `deleteFolderRemote()`, `deleteFileRemote()`

## 7. Wire sync into the store

In `app/lib/store.tsx`:

1. After `HYDRATE` from localStorage, also `fetchFolders()` + `fetchFiles()` from
   Supabase and dispatch a second `HYDRATE` with the merged result.
2. In each mutating action (`ADD_FOLDER`, `UPDATE_FILE`, …) call the matching
   `upsertFolder()` / `upsertFile()` after dispatching, e.g.:

   ```ts
   dispatch({ type: "UPDATE_FILE", payload: { id, content } });
   upsertFile(state.files.find((f) => f.id === id)!).catch(console.error);
   ```

3. For auth, use `supabase.auth.signInWithOtp({ email })` or OAuth and gate the
   app shell behind a `useUser()` hook.

## 8. (Optional) Realtime sync across tabs/devices

```ts
const supa = getSupabase();
supa
  .channel("files")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "files" },
    (payload) => {
      // dispatch HYDRATE or a targeted update
    }
  )
  .subscribe();
```

That's it — the localStorage layer keeps the app instant and offline-capable, and
Supabase makes it multi-device.

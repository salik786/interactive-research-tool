// Mirrors supabase/migrations/0003_latex_project_files.sql (keep in sync).
// Shown in the LaTeX page when the tables/bucket do not exist yet, so the
// user can paste it straight into the Supabase SQL Editor.
export const LATEX_MIGRATION_SQL = `-- LaTeX workspace v2: Overleaf-style multi-file projects.
-- Text files (.tex, .bib, .sty, ...) live in a table; binary files (images,
-- PDFs, fonts) live in a private Storage bucket. Idempotent — safe to re-run.

-- ───────────────────────── files ─────────────────────────
create table if not exists latex_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  path text not null,                                  -- e.g. "sections/intro.tex"
  kind text not null default 'text' check (kind in ('text', 'binary')),
  content text not null default '',                    -- text files only
  storage_path text,                                   -- binary files only (bucket key)
  mime_type text,
  size_bytes integer not null default 0,
  updated_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id, path)
);

create index if not exists latex_files_project_id_idx on latex_files(project_id);

drop trigger if exists latex_files_set_updated_at on latex_files;
create trigger latex_files_set_updated_at
  before update on latex_files
  for each row execute function set_updated_at();

alter table latex_files enable row level security;
drop policy if exists "members can view" on latex_files;
drop policy if exists "members can insert" on latex_files;
drop policy if exists "members can update" on latex_files;
drop policy if exists "members can delete" on latex_files;
create policy "members can view" on latex_files for select using (is_project_member(project_id));
create policy "members can insert" on latex_files for insert with check (is_project_member(project_id));
create policy "members can update" on latex_files for update using (is_project_member(project_id));
create policy "members can delete" on latex_files for delete using (is_project_member(project_id));

-- ─────────────────── per-project settings (main file) ───────────────────
create table if not exists latex_settings (
  project_id uuid primary key references projects(id) on delete cascade,
  main_file text,
  updated_by uuid references profiles(id),
  updated_at timestamptz default now()
);

drop trigger if exists latex_settings_set_updated_at on latex_settings;
create trigger latex_settings_set_updated_at
  before update on latex_settings
  for each row execute function set_updated_at();

alter table latex_settings enable row level security;
drop policy if exists "members can view" on latex_settings;
drop policy if exists "members can insert" on latex_settings;
drop policy if exists "members can update" on latex_settings;
drop policy if exists "members can delete" on latex_settings;
create policy "members can view" on latex_settings for select using (is_project_member(project_id));
create policy "members can insert" on latex_settings for insert with check (is_project_member(project_id));
create policy "members can update" on latex_settings for update using (is_project_member(project_id));
create policy "members can delete" on latex_settings for delete using (is_project_member(project_id));

-- ─────────────── Storage bucket for images / PDFs / fonts ───────────────
-- Private bucket; objects are keyed "<project_id>/<file_id>" and only members
-- of that project can read or write them.
insert into storage.buckets (id, name, public, file_size_limit)
values ('latex-assets', 'latex-assets', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists "latex assets: members can read" on storage.objects;
drop policy if exists "latex assets: members can upload" on storage.objects;
drop policy if exists "latex assets: members can update" on storage.objects;
drop policy if exists "latex assets: members can delete" on storage.objects;

create policy "latex assets: members can read" on storage.objects for select to authenticated
  using (
    bucket_id = 'latex-assets'
    and case when (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
         then is_project_member(((storage.foldername(name))[1])::uuid) else false end
  );
create policy "latex assets: members can upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'latex-assets'
    and case when (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
         then is_project_member(((storage.foldername(name))[1])::uuid) else false end
  );
create policy "latex assets: members can update" on storage.objects for update to authenticated
  using (
    bucket_id = 'latex-assets'
    and case when (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
         then is_project_member(((storage.foldername(name))[1])::uuid) else false end
  );
create policy "latex assets: members can delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'latex-assets'
    and case when (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
         then is_project_member(((storage.foldername(name))[1])::uuid) else false end
  );
`;

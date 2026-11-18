-- LaTeX workspace: one editable .tex source per project.
-- Idempotent — safe to run more than once.

create table if not exists latex_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  content text not null default '',
  updated_by uuid references profiles(id),
  updated_at timestamptz default now(),
  unique (project_id)
);

create index if not exists latex_documents_project_id_idx on latex_documents(project_id);

-- Reuses set_updated_at() from 0001_init.sql
drop trigger if exists latex_documents_set_updated_at on latex_documents;
create trigger latex_documents_set_updated_at
  before update on latex_documents
  for each row execute function set_updated_at();

alter table latex_documents enable row level security;

drop policy if exists "members can view" on latex_documents;
drop policy if exists "members can insert" on latex_documents;
drop policy if exists "members can update" on latex_documents;
drop policy if exists "members can delete" on latex_documents;

create policy "members can view" on latex_documents for select using (is_project_member(project_id));
create policy "members can insert" on latex_documents for insert with check (is_project_member(project_id));
create policy "members can update" on latex_documents for update using (is_project_member(project_id));
create policy "members can delete" on latex_documents for delete using (is_project_member(project_id));

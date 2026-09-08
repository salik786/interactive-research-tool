-- Review Workbench: initial schema, triggers, and RLS policies.
create extension if not exists "pgcrypto";

-- =========================================================================
-- TABLES
-- =========================================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  research_question text default '',
  aim text default '',
  pcc_population text default '',
  pcc_concept text default '',
  pcc_context text default '',
  scope_notes text default '',
  identified_count int,
  duplicates_removed_count int,
  excluded_screening_count int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table project_members (
  project_id uuid references projects(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text default 'editor' check (role in ('owner','editor','viewer')),
  invited_at timestamptz default now(),
  primary key (project_id, user_id)
);

-- Invites for emails that don't have an account yet. Resolved into
-- project_members on the invitee's first sign-in (see handle_new_user below).
create table pending_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  email text not null,
  role text default 'editor' check (role in ('owner','editor','viewer')),
  invited_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table project_objectives (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  content text not null,
  position int default 0
);

create table project_sub_questions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  content text not null,
  position int default 0
);

create table search_blocks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  terms text[] default '{}',
  position int default 0
);

create table search_tests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  database text,
  version_label text,
  results_count text,
  relevance_pct text,
  seed_papers_captured text default 'Not checked',
  decision text default 'pending' check (decision in ('pending','keep','revise','reject')),
  query_string text,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  citation text not null,
  doi text,
  authors text,
  year int,
  venue text,
  abstract text,
  pdf_url text,
  library_owner_id uuid references profiles(id) not null,
  created_at timestamptz default now()
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources(id) on delete cascade,
  content text not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table note_links (
  id uuid primary key default gen_random_uuid(),
  from_note_id uuid references notes(id) on delete cascade,
  to_note_id uuid references notes(id) on delete cascade,
  relation_type text default 'related_to' check (relation_type in ('supports','contradicts','extends','related_to'))
);

create table tags (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

create table note_tags (
  note_id uuid references notes(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  primary key (note_id, tag_id)
);

create table project_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  source_id uuid references sources(id) on delete cascade,
  method text,
  dataset text,
  key_result text,
  theme text,
  status text default 'pending' check (status in ('keep','pending','excluded')),
  exclusion_reason text,
  relevance_note text,
  added_by uuid references profiles(id),
  created_at timestamptz default now(),
  unique (project_id, source_id)
);

create table project_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  note_id uuid references notes(id) on delete cascade,
  theme text,
  added_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table screening_criteria (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  type text check (type in ('include','exclude')),
  content text not null,
  position int default 0
);

create table theme_synthesis (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  theme_name text not null,
  content text default '',
  updated_at timestamptz default now(),
  unique (project_id, theme_name)
);

create table outline_sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  section_key text check (section_key in ('intro','gap','approach','related_work')),
  content text default '',
  updated_at timestamptz default now(),
  unique (project_id, section_key)
);

create table ai_generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  target text not null,
  provider text check (provider in ('anthropic','openai')),
  model text,
  input_sections jsonb,
  prompt_text text,
  response_text text,
  inserted_into text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- =========================================================================
-- INDEXES
-- =========================================================================
create index on project_members(user_id);
create index on project_objectives(project_id, position);
create index on project_sub_questions(project_id, position);
create index on search_blocks(project_id, position);
create index on search_tests(project_id);
create index on sources(library_owner_id);
create index on sources(doi);
create index on notes(source_id);
create index on project_sources(project_id);
create index on project_sources(source_id);
create index on project_sources(status);
create index on project_notes(project_id);
create index on screening_criteria(project_id, position);
create index on theme_synthesis(project_id);
create index on outline_sections(project_id);
create index on ai_generations(project_id, created_at desc);
create index on pending_invites(lower(email));

-- =========================================================================
-- TRIGGERS
-- =========================================================================

-- Auto-create a profile row when a new auth user signs up, and resolve any
-- pending invites for that email into real project_members rows.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set email = excluded.email;

  insert into public.project_members (project_id, user_id, role)
  select pi.project_id, new.id, pi.role
  from public.pending_invites pi
  where lower(pi.email) = lower(new.email)
  on conflict (project_id, user_id) do nothing;

  delete from public.pending_invites where lower(email) = lower(new.email);

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Keep projects.updated_at current.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_set_updated_at
  before update on projects
  for each row execute function set_updated_at();

create trigger theme_synthesis_set_updated_at
  before update on theme_synthesis
  for each row execute function set_updated_at();

create trigger outline_sections_set_updated_at
  before update on outline_sections
  for each row execute function set_updated_at();

-- When a project is created, add the owner as a project_members row.
create or replace function handle_new_project()
returns trigger as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (project_id, user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_project_created
  after insert on projects
  for each row execute function handle_new_project();

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================

create or replace function is_project_member(pid uuid)
returns boolean as $$
  select exists (
    select 1 from project_members
    where project_id = pid and user_id = auth.uid()
  );
$$ language sql security definer stable;

create or replace function is_project_owner(pid uuid)
returns boolean as $$
  select exists (
    select 1 from project_members
    where project_id = pid and user_id = auth.uid() and role = 'owner'
  );
$$ language sql security definer stable;

-- ---- profiles ----
alter table profiles enable row level security;
create policy "profiles are readable by any authenticated user" on profiles
  for select using (auth.role() = 'authenticated');
create policy "users can update own profile" on profiles
  for update using (id = auth.uid());
create policy "users can insert own profile" on profiles
  for insert with check (id = auth.uid());

-- ---- projects ----
alter table projects enable row level security;
-- `owner_id = auth.uid()` is included (not just is_project_member) because a
-- brand-new project's project_members row is only added by an AFTER INSERT
-- trigger — without this fallback, Postgres's RETURNING clause on the
-- INSERT would find the fresh row not yet SELECT-visible and report the
-- whole insert as an RLS violation.
create policy "members can view" on projects for select using (is_project_member(id) or owner_id = auth.uid());
create policy "members can update" on projects for update using (is_project_member(id));
create policy "owner can delete" on projects for delete using (owner_id = auth.uid());
create policy "authenticated users can create" on projects for insert with check (owner_id = auth.uid());

-- ---- project_members ----
alter table project_members enable row level security;
create policy "members can view" on project_members for select using (is_project_member(project_id));
create policy "owners can update roles" on project_members for update using (is_project_owner(project_id));
create policy "owners can add members" on project_members for insert with check (
  is_project_owner(project_id) or user_id = auth.uid()
);
create policy "owners can remove members" on project_members for delete using (
  is_project_owner(project_id) or user_id = auth.uid()
);

-- ---- pending_invites ----
alter table pending_invites enable row level security;
create policy "members can view invites" on pending_invites for select using (is_project_member(project_id));
create policy "members can create invites" on pending_invites for insert with check (is_project_member(project_id));
create policy "owners can delete invites" on pending_invites for delete using (is_project_owner(project_id));

-- ---- project_objectives ----
alter table project_objectives enable row level security;
create policy "members can view" on project_objectives for select using (is_project_member(project_id));
create policy "members can insert" on project_objectives for insert with check (is_project_member(project_id));
create policy "members can update" on project_objectives for update using (is_project_member(project_id));
create policy "members can delete" on project_objectives for delete using (is_project_member(project_id));

-- ---- project_sub_questions ----
alter table project_sub_questions enable row level security;
create policy "members can view" on project_sub_questions for select using (is_project_member(project_id));
create policy "members can insert" on project_sub_questions for insert with check (is_project_member(project_id));
create policy "members can update" on project_sub_questions for update using (is_project_member(project_id));
create policy "members can delete" on project_sub_questions for delete using (is_project_member(project_id));

-- ---- search_blocks ----
alter table search_blocks enable row level security;
create policy "members can view" on search_blocks for select using (is_project_member(project_id));
create policy "members can insert" on search_blocks for insert with check (is_project_member(project_id));
create policy "members can update" on search_blocks for update using (is_project_member(project_id));
create policy "members can delete" on search_blocks for delete using (is_project_member(project_id));

-- ---- search_tests ----
alter table search_tests enable row level security;
create policy "members can view" on search_tests for select using (is_project_member(project_id));
create policy "members can insert" on search_tests for insert with check (is_project_member(project_id));
create policy "members can update" on search_tests for update using (is_project_member(project_id));
create policy "members can delete" on search_tests for delete using (is_project_member(project_id));

-- ---- project_sources ----
alter table project_sources enable row level security;
create policy "members can view" on project_sources for select using (is_project_member(project_id));
create policy "members can insert" on project_sources for insert with check (is_project_member(project_id));
create policy "members can update" on project_sources for update using (is_project_member(project_id));
create policy "members can delete" on project_sources for delete using (is_project_member(project_id));

-- ---- project_notes ----
alter table project_notes enable row level security;
create policy "members can view" on project_notes for select using (is_project_member(project_id));
create policy "members can insert" on project_notes for insert with check (is_project_member(project_id));
create policy "members can update" on project_notes for update using (is_project_member(project_id));
create policy "members can delete" on project_notes for delete using (is_project_member(project_id));

-- ---- screening_criteria ----
alter table screening_criteria enable row level security;
create policy "members can view" on screening_criteria for select using (is_project_member(project_id));
create policy "members can insert" on screening_criteria for insert with check (is_project_member(project_id));
create policy "members can update" on screening_criteria for update using (is_project_member(project_id));
create policy "members can delete" on screening_criteria for delete using (is_project_member(project_id));

-- ---- theme_synthesis ----
alter table theme_synthesis enable row level security;
create policy "members can view" on theme_synthesis for select using (is_project_member(project_id));
create policy "members can insert" on theme_synthesis for insert with check (is_project_member(project_id));
create policy "members can update" on theme_synthesis for update using (is_project_member(project_id));
create policy "members can delete" on theme_synthesis for delete using (is_project_member(project_id));

-- ---- outline_sections ----
alter table outline_sections enable row level security;
create policy "members can view" on outline_sections for select using (is_project_member(project_id));
create policy "members can insert" on outline_sections for insert with check (is_project_member(project_id));
create policy "members can update" on outline_sections for update using (is_project_member(project_id));
create policy "members can delete" on outline_sections for delete using (is_project_member(project_id));

-- ---- ai_generations ----
alter table ai_generations enable row level security;
create policy "members can view" on ai_generations for select using (is_project_member(project_id));
create policy "members can insert" on ai_generations for insert with check (is_project_member(project_id));
create policy "members can update" on ai_generations for update using (is_project_member(project_id));
create policy "members can delete" on ai_generations for delete using (is_project_member(project_id));

-- ---- sources (shared library) ----
alter table sources enable row level security;
create policy "owner or collaborator can view" on sources for select using (
  library_owner_id = auth.uid()
  or exists (
    select 1 from project_sources ps
    where ps.source_id = sources.id and is_project_member(ps.project_id)
  )
);
create policy "authenticated users can insert into own library" on sources for insert with check (
  library_owner_id = auth.uid()
);
create policy "owner can modify" on sources for update using (library_owner_id = auth.uid());
create policy "owner can delete" on sources for delete using (library_owner_id = auth.uid());

-- ---- notes ----
alter table notes enable row level security;
create policy "owner or collaborator can view" on notes for select using (
  exists (
    select 1 from sources s where s.id = notes.source_id and s.library_owner_id = auth.uid()
  )
  or exists (
    select 1 from project_notes pn where pn.note_id = notes.id and is_project_member(pn.project_id)
  )
);
create policy "source owner can insert notes" on notes for insert with check (
  exists (select 1 from sources s where s.id = notes.source_id and s.library_owner_id = auth.uid())
);
create policy "source owner can update notes" on notes for update using (
  exists (select 1 from sources s where s.id = notes.source_id and s.library_owner_id = auth.uid())
);
create policy "source owner can delete notes" on notes for delete using (
  exists (select 1 from sources s where s.id = notes.source_id and s.library_owner_id = auth.uid())
);

-- ---- note_links ----
alter table note_links enable row level security;
create policy "visible if either note is visible" on note_links for select using (
  exists (
    select 1 from notes n join sources s on s.id = n.source_id
    where n.id = note_links.from_note_id and s.library_owner_id = auth.uid()
  )
  or exists (
    select 1 from notes n join sources s on s.id = n.source_id
    where n.id = note_links.to_note_id and s.library_owner_id = auth.uid()
  )
);
create policy "source owner can manage links" on note_links for insert with check (
  exists (
    select 1 from notes n join sources s on s.id = n.source_id
    where n.id = note_links.from_note_id and s.library_owner_id = auth.uid()
  )
);
create policy "source owner can delete links" on note_links for delete using (
  exists (
    select 1 from notes n join sources s on s.id = n.source_id
    where n.id = note_links.from_note_id and s.library_owner_id = auth.uid()
  )
);

-- ---- tags / note_tags: shared vocabulary, low risk ----
alter table tags enable row level security;
create policy "any authenticated user can read tags" on tags for select using (auth.role() = 'authenticated');
create policy "any authenticated user can create tags" on tags for insert with check (auth.role() = 'authenticated');

alter table note_tags enable row level security;
create policy "any authenticated user can read note_tags" on note_tags for select using (auth.role() = 'authenticated');
create policy "any authenticated user can manage note_tags" on note_tags for insert with check (auth.role() = 'authenticated');
create policy "any authenticated user can delete note_tags" on note_tags for delete using (auth.role() = 'authenticated');

-- =========================================================================
-- REALTIME
-- =========================================================================
alter publication supabase_realtime add table project_sources;
alter publication supabase_realtime add table theme_synthesis;
alter publication supabase_realtime add table search_tests;

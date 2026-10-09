-- TechLead initial schema.
-- Every record carries a visibility (private, team, guest). Row-level security
-- enforces it in the database, so a bug in the API cannot leak private items.

create type member_role as enum ('owner', 'team', 'guest');
create type visibility as enum ('private', 'team', 'guest');

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  profile text not null default '',   -- AI-drafted company profile, edited by the owner
  focus text not null default '',     -- the owner's current focus note
  created_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  display_name text not null,
  role member_role not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

-- The caller's role in a workspace, or null when they are not a member.
create function public.member_role(ws uuid) returns member_role
language sql stable security definer set search_path = public as $$
  select role from members where workspace_id = ws and user_id = auth.uid()
$$;

create function public.member_id(ws uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from members where workspace_id = ws and user_id = auth.uid()
$$;

create function public.can_view(ws uuid, v visibility) returns boolean
language sql stable as $$
  select case public.member_role(ws)
    when 'owner' then true
    when 'team' then v in ('team', 'guest')
    when 'guest' then v = 'guest'
    else false
  end
$$;

create table solutions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  name text not null,
  summary text not null default '',
  health text not null default 'green' check (health in ('green', 'amber', 'red')),
  phase text not null default 'discovery' check (phase in ('discovery', 'design', 'build', 'run', 'sunset')),
  visibility visibility not null default 'team',
  created_at timestamptz not null default now()
);

-- Jira projects the owner chose to sync, each mapped to a solution.
create table jira_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  jira_project_key text not null,
  jira_site text not null,
  solution_id uuid references solutions on delete set null,
  last_synced_at timestamptz,
  unique (workspace_id, jira_site, jira_project_key)
);

-- Raw inputs: a Teams transcript, a Jira issue snapshot, or a written note.
create table sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  kind text not null check (kind in ('teams_transcript', 'jira_issue', 'note')),
  title text not null,
  external_ref text,                  -- Teams meeting id or Jira issue key
  storage_path text,                  -- transcript file in Supabase Storage
  body text,                          -- note text or normalised issue text
  solution_id uuid references solutions on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, kind, external_ref)
);

-- AI suggestions waiting for the owner. Accepted ones become records.
create table proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  source_id uuid not null references sources on delete cascade,
  solution_id uuid references solutions on delete set null,
  draft jsonb not null,
  evidence text not null default '',
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  state text not null default 'pending' check (state in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  solution_id uuid references solutions on delete set null,
  source_id uuid references sources on delete set null,
  visibility visibility not null default 'private',
  title text not null,
  status text not null default 'todo' check (status in ('todo', 'doing', 'blocked', 'done')),
  priority text not null default 'P2' check (priority in ('P1', 'P2', 'P3')),
  owner_member_id uuid references members on delete set null,
  due date,
  jira_key text,
  created_at timestamptz not null default now()
);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  solution_id uuid references solutions on delete set null,
  source_id uuid references sources on delete set null,
  visibility visibility not null default 'private',
  number int not null,
  title text not null,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'superseded', 'rejected')),
  context text not null default '',
  decision text not null default '',
  consequences text not null default '',
  created_at timestamptz not null default now(),
  unique (workspace_id, number)
);

create table risks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  solution_id uuid references solutions on delete set null,
  source_id uuid references sources on delete set null,
  visibility visibility not null default 'private',
  title text not null,
  impact text not null check (impact in ('low', 'medium', 'high')),
  likelihood text not null check (likelihood in ('low', 'medium', 'high')),
  mitigation text not null default '',
  created_at timestamptz not null default now()
);

create table team_statuses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  solution_id uuid references solutions on delete set null,
  source_id uuid references sources on delete set null,
  visibility visibility not null default 'private',
  person_name text not null,
  owner_member_id uuid references members on delete set null,
  status text not null check (status in ('on_track', 'overloaded', 'blocked', 'away')),
  note text not null default '',
  as_of date not null default current_date,
  created_at timestamptz not null default now()
);

-- OAuth tokens for Jira and Microsoft Graph. No policies: only the
-- service role (API and worker) can read or write this table.
create table integration_tokens (
  workspace_id uuid not null references workspaces on delete cascade,
  provider text not null check (provider in ('jira', 'microsoft')),
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  meta jsonb not null default '{}',
  primary key (workspace_id, provider)
);

-- Row-level security ------------------------------------------------------

alter table workspaces enable row level security;
alter table members enable row level security;
alter table solutions enable row level security;
alter table jira_projects enable row level security;
alter table sources enable row level security;
alter table proposals enable row level security;
alter table tasks enable row level security;
alter table decisions enable row level security;
alter table risks enable row level security;
alter table team_statuses enable row level security;
alter table integration_tokens enable row level security;

create policy "members read their workspace" on workspaces for select
  using (public.member_role(id) is not null);
create policy "owner edits workspace" on workspaces for update
  using (public.member_role(id) = 'owner');

create policy "members see each other" on members for select
  using (public.member_role(workspace_id) is not null);
create policy "owner manages members" on members for all
  using (public.member_role(workspace_id) = 'owner')
  with check (public.member_role(workspace_id) = 'owner');

-- Owner-only tables: the AI inbox and its inputs, and the Jira selection.
create policy "owner only" on sources for all
  using (public.member_role(workspace_id) = 'owner')
  with check (public.member_role(workspace_id) = 'owner');
create policy "owner only" on proposals for all
  using (public.member_role(workspace_id) = 'owner')
  with check (public.member_role(workspace_id) = 'owner');
create policy "owner only" on jira_projects for all
  using (public.member_role(workspace_id) = 'owner')
  with check (public.member_role(workspace_id) = 'owner');

-- Records: read by visibility, written by the owner.
create policy "read by visibility" on solutions for select using (public.can_view(workspace_id, visibility));
create policy "owner writes" on solutions for all
  using (public.member_role(workspace_id) = 'owner') with check (public.member_role(workspace_id) = 'owner');

create policy "read by visibility" on tasks for select using (public.can_view(workspace_id, visibility));
create policy "owner writes" on tasks for all
  using (public.member_role(workspace_id) = 'owner') with check (public.member_role(workspace_id) = 'owner');
-- Team members update their own tasks, and cannot make them private.
create policy "team updates own tasks" on tasks for update
  using (public.member_role(workspace_id) = 'team' and owner_member_id = public.member_id(workspace_id) and visibility <> 'private')
  with check (public.member_role(workspace_id) = 'team' and owner_member_id = public.member_id(workspace_id) and visibility <> 'private');

create policy "read by visibility" on decisions for select using (public.can_view(workspace_id, visibility));
create policy "owner writes" on decisions for all
  using (public.member_role(workspace_id) = 'owner') with check (public.member_role(workspace_id) = 'owner');

create policy "read by visibility" on risks for select using (public.can_view(workspace_id, visibility));
create policy "owner writes" on risks for all
  using (public.member_role(workspace_id) = 'owner') with check (public.member_role(workspace_id) = 'owner');

create policy "read by visibility" on team_statuses for select using (public.can_view(workspace_id, visibility));
create policy "owner writes" on team_statuses for all
  using (public.member_role(workspace_id) = 'owner') with check (public.member_role(workspace_id) = 'owner');
create policy "team updates own status" on team_statuses for update
  using (public.member_role(workspace_id) = 'team' and owner_member_id = public.member_id(workspace_id) and visibility <> 'private')
  with check (public.member_role(workspace_id) = 'team' and owner_member_id = public.member_id(workspace_id) and visibility <> 'private');

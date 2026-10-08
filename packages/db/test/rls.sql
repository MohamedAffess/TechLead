-- Row-level security checks. Each \echo line names what is being proven;
-- any failed assertion aborts the script with an error.
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

insert into auth.users values
  ('00000000-0000-4000-8000-00000000000a'), -- owner
  ('00000000-0000-4000-8000-00000000000b'), -- team member
  ('00000000-0000-4000-8000-00000000000c'), -- guest
  ('00000000-0000-4000-8000-00000000000d'); -- stranger
insert into workspaces (id, company_name) values ('10000000-0000-4000-8000-000000000001', 'Infor');
insert into members (id, workspace_id, user_id, display_name, role) values
  ('20000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'Owner', 'owner'),
  ('20000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'Team', 'team'),
  ('20000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000c', 'Guest', 'guest');
insert into tasks (workspace_id, visibility, title, owner_member_id) values
  ('10000000-0000-4000-8000-000000000001', 'private', 'secret', null),
  ('10000000-0000-4000-8000-000000000001', 'team', 'team task', '20000000-0000-4000-8000-00000000000b'),
  ('10000000-0000-4000-8000-000000000001', 'guest', 'public task', null);
insert into sources (id, workspace_id, kind, title) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'note', 'n');
insert into proposals (workspace_id, source_id, draft, confidence) values
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '{}', 'high');

create function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAILED: %', label; end if;
  raise notice 'ok - %', label;
end $$;

set role authenticated;

set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.check('owner sees all 3 tasks', (select count(*) from tasks) = 3);
select pg_temp.check('owner sees the AI inbox', (select count(*) from proposals) = 1);

set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
select pg_temp.check('team sees 2 tasks, not the private one', (select count(*) from tasks) = 2);
select pg_temp.check('team cannot see the AI inbox', (select count(*) from proposals) = 0);
update tasks set status = 'doing' where title = 'team task';
select pg_temp.check('team updates own task', (select status from tasks where title = 'team task') = 'doing');
update tasks set status = 'done' where title = 'public task';
select pg_temp.check('team cannot update others'' tasks', (select status from tasks where title = 'public task') = 'todo');
do $$ begin
  update tasks set visibility = 'private' where title = 'team task';
  raise exception 'FAILED: team made a task private';
exception when insufficient_privilege then raise notice 'ok - team cannot make a task private';
end $$;

set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000c';
select pg_temp.check('guest sees only the guest task', (select count(*) from tasks) = 1);
update tasks set status = 'done';
reset role;
select pg_temp.check('guest edits nothing', (select count(*) from tasks where status = 'done') = 0);
set role authenticated;

set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000d';
select pg_temp.check('stranger sees nothing', (select count(*) from tasks) = 0 and (select count(*) from workspaces) = 0);
select pg_temp.check('nobody but the service role reads tokens', (select count(*) from integration_tokens) = 0);

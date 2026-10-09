-- Run once in the Supabase SQL Editor, after signing in to the web app once.
-- Replace the email with the one you signed in with.
with owner as (
  select id from auth.users where email = 'you@infor.com'
), ws as (
  insert into workspaces (company_name) values ('Infor') returning id
)
insert into members (workspace_id, user_id, display_name, role)
select ws.id, owner.id, 'Your name', 'owner' from ws, owner;

-- Add a team member or a guest later (they sign in once first):
-- insert into members (workspace_id, user_id, display_name, role)
-- select w.id, u.id, 'Their name', 'team'   -- or 'guest'
-- from workspaces w, auth.users u where u.email = 'them@infor.com';

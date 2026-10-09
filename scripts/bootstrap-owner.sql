-- You normally don't need this: the owner is set up on first sign-in
-- (see docs/DEPLOYMENT.md). Run these in the Supabase SQL Editor only if needed.

-- Choose who becomes the owner on first sign-in:
insert into settings (key, value) values ('owner_email', 'you@example.com')
on conflict (key) do update set value = excluded.value;

-- Add a team member or a guest (they sign in once first):
-- insert into members (workspace_id, user_id, display_name, role)
-- select w.id, u.id, 'Their name', 'team'   -- or 'guest'
-- from workspaces w, auth.users u where u.email = 'them@example.com';

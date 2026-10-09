-- First sign-in setup, so nobody has to run SQL by hand.
-- The go-live workflow stores the owner's email here. When that person signs
-- in for the first time, claim_workspace() creates the workspace (if there is
-- none yet) and makes them its owner. Anyone else gets nothing.

create table settings (
  key text primary key,
  value text not null
);
alter table settings enable row level security;
-- No policies: only the service role and security definer functions read it.

create function public.claim_workspace(display_name text) returns members
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  owner_email text;
  ws uuid;
  result members;
begin
  if me is null then
    return null;
  end if;

  select * into result from members where user_id = me limit 1;
  if found then
    return result;
  end if;

  select lower(value) into owner_email from settings where key = 'owner_email';
  if owner_email is null or owner_email = '' or owner_email <> my_email then
    return null;
  end if;

  -- One owner per workspace: only claim a workspace that has no owner yet.
  select w.id into ws from workspaces w
  where not exists (select 1 from members m where m.workspace_id = w.id and m.role = 'owner')
  order by w.created_at
  limit 1;
  if ws is null then
    if exists (select 1 from members where role = 'owner') then
      return null;
    end if;
    insert into workspaces (company_name) values ('My company') returning id into ws;
  end if;

  insert into members (workspace_id, user_id, display_name, role)
  values (ws, me, coalesce(nullif(display_name, ''), split_part(my_email, '@', 1)), 'owner')
  returning * into result;
  return result;
end;
$$;

revoke all on function public.claim_workspace(text) from public;
grant execute on function public.claim_workspace(text) to authenticated;

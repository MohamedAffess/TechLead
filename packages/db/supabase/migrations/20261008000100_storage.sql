-- Private bucket for uploaded Teams transcripts. Only the service role
-- (worker) and the workspace owner's uploads touch it.
insert into storage.buckets (id, name, public) values ('transcripts', 'transcripts', false)
on conflict (id) do nothing;

create policy "owner uploads transcripts" on storage.objects for insert to authenticated
  with check (bucket_id = 'transcripts' and public.member_role(((storage.foldername(name))[1])::uuid) = 'owner');
create policy "owner reads transcripts" on storage.objects for select to authenticated
  using (bucket_id = 'transcripts' and public.member_role(((storage.foldername(name))[1])::uuid) = 'owner');

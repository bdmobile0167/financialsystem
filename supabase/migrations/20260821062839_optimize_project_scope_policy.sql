drop policy if exists "projects scoped read" on public.projects;

create policy "projects scoped read"
on public.projects for select to authenticated
using (
  public.get_my_role() = any (array['admin'::text, 'accounting'::text])
  or exists (
    select 1
    from public.project_members membership
    where membership.project_id = projects.id
      and membership.user_id = (select auth.uid())
  )
);

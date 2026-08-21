drop policy if exists "projects authenticated read" on public.projects;

create policy "projects scoped read"
on public.projects for select to authenticated
using (
  public.get_my_role() = any (array['admin'::text, 'accounting'::text])
  or exists (
    select 1
    from public.project_members membership
    where membership.project_id = projects.id
      and membership.user_id = auth.uid()
  )
);

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id
     and public.get_my_role() <> 'admin'
     and (
       new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.permissions is distinct from old.permissions
       or new.department_id is distinct from old.department_id
     ) then
    raise exception 'Only an administrator can change roles, permissions, status, or department';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileges_trigger on public.profiles;
create trigger protect_profile_privileges_trigger
before update on public.profiles
for each row execute function public.protect_profile_privileges();

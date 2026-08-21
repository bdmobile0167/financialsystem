revoke all on function public.protect_profile_privileges() from public, anon, authenticated;

create index if not exists idx_company_settings_updated_by
on public.company_settings(updated_by);

drop policy if exists "company settings finance write" on public.company_settings;
create policy "company settings finance insert" on public.company_settings
for insert to authenticated
with check (public.get_my_role() = any (array['admin'::text, 'accounting'::text]));
create policy "company settings finance update" on public.company_settings
for update to authenticated
using (public.get_my_role() = any (array['admin'::text, 'accounting'::text]))
with check (public.get_my_role() = any (array['admin'::text, 'accounting'::text]));
create policy "company settings finance delete" on public.company_settings
for delete to authenticated
using (public.get_my_role() = any (array['admin'::text, 'accounting'::text]));

drop policy if exists "company business finance write" on public.company_business_items;
create policy "company business finance insert" on public.company_business_items
for insert to authenticated
with check (public.get_my_role() = any (array['admin'::text, 'accounting'::text]));
create policy "company business finance update" on public.company_business_items
for update to authenticated
using (public.get_my_role() = any (array['admin'::text, 'accounting'::text]))
with check (public.get_my_role() = any (array['admin'::text, 'accounting'::text]));
create policy "company business finance delete" on public.company_business_items
for delete to authenticated
using (public.get_my_role() = any (array['admin'::text, 'accounting'::text]));

drop policy if exists "company shareholders finance write" on public.company_shareholders;
create policy "company shareholders finance insert" on public.company_shareholders
for insert to authenticated
with check (public.get_my_role() = any (array['admin'::text, 'accounting'::text]));
create policy "company shareholders finance update" on public.company_shareholders
for update to authenticated
using (public.get_my_role() = any (array['admin'::text, 'accounting'::text]))
with check (public.get_my_role() = any (array['admin'::text, 'accounting'::text]));
create policy "company shareholders finance delete" on public.company_shareholders
for delete to authenticated
using (public.get_my_role() = any (array['admin'::text, 'accounting'::text]));

drop policy if exists "projects admin accounting write" on public.projects;
create policy "projects finance insert" on public.projects
for insert to authenticated
with check (public.get_my_role() = any (array['admin'::text, 'accounting'::text]));
create policy "projects finance update" on public.projects
for update to authenticated
using (public.get_my_role() = any (array['admin'::text, 'accounting'::text]))
with check (public.get_my_role() = any (array['admin'::text, 'accounting'::text]));
create policy "projects finance delete" on public.projects
for delete to authenticated
using (public.get_my_role() = any (array['admin'::text, 'accounting'::text]));

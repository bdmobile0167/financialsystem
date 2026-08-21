create table if not exists public.company_settings (
  id smallint primary key default 1 check (id = 1),
  company_name_zh text not null default '',
  company_name_en text,
  tax_id text,
  phone text,
  address text,
  precheck_number text,
  representative_name text,
  board_count integer not null default 0 check (board_count >= 0),
  total_capital numeric(18, 2) not null default 0 check (total_capital >= 0),
  capital_cash numeric(18, 2) not null default 0 check (capital_cash >= 0),
  capital_property numeric(18, 2) not null default 0 check (capital_property >= 0),
  capital_technology numeric(18, 2) not null default 0 check (capital_technology >= 0),
  capital_merge_new numeric(18, 2) not null default 0 check (capital_merge_new >= 0),
  planned_open_date date,
  articles_date date,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_business_items (
  code text primary key,
  item text not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.company_shareholders (
  id uuid primary key default gen_random_uuid(),
  role_title text,
  full_name text not null,
  national_id text,
  contribution_amount numeric(18, 2) not null default 0 check (contribution_amount >= 0),
  address text,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.company_settings enable row level security;
alter table public.company_business_items enable row level security;
alter table public.company_shareholders enable row level security;

create policy "company settings authenticated read"
on public.company_settings for select to authenticated
using (true);

create policy "company settings finance write"
on public.company_settings for all to authenticated
using (public.get_my_role() = any (array['admin'::text, 'accounting'::text]))
with check (public.get_my_role() = any (array['admin'::text, 'accounting'::text]));

create policy "company business authenticated read"
on public.company_business_items for select to authenticated
using (true);

create policy "company business finance write"
on public.company_business_items for all to authenticated
using (public.get_my_role() = any (array['admin'::text, 'accounting'::text]))
with check (public.get_my_role() = any (array['admin'::text, 'accounting'::text]));

create policy "company shareholders finance read"
on public.company_shareholders for select to authenticated
using (public.get_my_role() = any (array['admin'::text, 'accounting'::text]));

create policy "company shareholders finance write"
on public.company_shareholders for all to authenticated
using (public.get_my_role() = any (array['admin'::text, 'accounting'::text]))
with check (public.get_my_role() = any (array['admin'::text, 'accounting'::text]));

grant select on public.company_settings, public.company_business_items to authenticated;
grant insert, update, delete on public.company_settings, public.company_business_items to authenticated;
grant select, insert, update, delete on public.company_shareholders to authenticated;

insert into public.company_settings (
  id, company_name_zh, company_name_en, tax_id, phone, address,
  precheck_number, total_capital, capital_cash, planned_open_date
) values (
  1, '開發科技股份有限公司', 'Development Tech Co., Ltd.', '12345678',
  '02-2345-6789', '(110)台北市信義區松仁路300號', 'A20250626001',
  10000000, 900000, '2025-07-01'
)
on conflict (id) do nothing;

insert into public.company_business_items (code, item, sort_order) values
  ('A1820', 'AI伺服器', 1),
  ('B3342', '醫療軟體', 2),
  ('C5580', '監測儀', 3)
on conflict (code) do nothing;

insert into public.company_shareholders (
  role_title, full_name, national_id, contribution_amount, address, sort_order
)
select source.role_title, source.full_name, source.national_id, source.contribution_amount, source.address, source.sort_order
from (values
  ('執行長', '李曉明', 'B223755666', 400000::numeric, '台中市西屯區', 1),
  ('監察', '張曉嵐', 'R932012338', 500000::numeric, '台北市文山區', 2)
) as source(role_title, full_name, national_id, contribution_amount, address, sort_order)
where not exists (
  select 1 from public.company_shareholders existing
  where existing.national_id = source.national_id
);

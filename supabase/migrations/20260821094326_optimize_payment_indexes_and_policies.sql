create index if not exists idx_payment_recipients_updated_by
  on public.payment_recipients(updated_by);

create index if not exists idx_voucher_payments_processed_by
  on public.voucher_payments(processed_by);

create index if not exists idx_vouchers_accounting_account_id
  on public.vouchers(accounting_account_id);

create index if not exists idx_vouchers_accounting_approved_by
  on public.vouchers(accounting_approved_by);

drop policy if exists "payment recipients finance write" on public.payment_recipients;

create policy "payment recipients finance insert"
on public.payment_recipients for insert to authenticated
with check (public.get_my_role() in ('admin', 'accounting'));

create policy "payment recipients finance update"
on public.payment_recipients for update to authenticated
using (public.get_my_role() in ('admin', 'accounting'))
with check (public.get_my_role() in ('admin', 'accounting'));

create policy "payment recipients finance delete"
on public.payment_recipients for delete to authenticated
using (public.get_my_role() in ('admin', 'accounting'));

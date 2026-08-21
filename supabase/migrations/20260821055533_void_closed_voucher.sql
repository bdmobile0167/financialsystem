create or replace function public.void_closed_voucher(
  p_voucher_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_voucher public.vouchers%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  select role
    into v_actor_role
    from public.profiles
   where id = v_actor_id;

  if v_actor_role is null or v_actor_role not in ('accounting', 'admin') then
    raise exception 'Only accounting or admin users can void a closed voucher';
  end if;

  p_reason := btrim(coalesce(p_reason, ''));
  if char_length(p_reason) < 3 then
    raise exception 'A void reason of at least 3 characters is required';
  end if;
  if char_length(p_reason) > 500 then
    raise exception 'The void reason cannot exceed 500 characters';
  end if;

  select *
    into v_voucher
    from public.vouchers
   where id = p_voucher_id
   for update;

  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status <> 'closed' then
    raise exception 'Only a closed voucher can be voided';
  end if;

  delete from public.journal_entries
   where voucher_id = p_voucher_id;

  delete from public.bank_transactions
   where voucher_id = p_voucher_id;

  delete from public.voucher_payments
   where voucher_id = p_voucher_id;

  if v_voucher.project_id is not null then
    update public.projects
       set remaining_budget = least(
         coalesce(total_budget, 0),
         coalesce(remaining_budget, 0) + coalesce(v_voucher.total_amount, 0)
       )
     where id = v_voucher.project_id;
  end if;

  update public.vouchers
     set status = 'voided',
         updated_at = now()
   where id = p_voucher_id;

  insert into public.voucher_workflow_logs (
    voucher_id,
    actor_id,
    action,
    from_status,
    to_status,
    reject_reason
  ) values (
    p_voucher_id,
    v_actor_id,
    'recall',
    'closed',
    'voided',
    p_reason
  );

  return jsonb_build_object(
    'voucher_id', p_voucher_id,
    'status', 'voided',
    'reason', p_reason
  );
end;
$$;

revoke all on function public.void_closed_voucher(uuid, text) from public;
revoke all on function public.void_closed_voucher(uuid, text) from anon;
grant execute on function public.void_closed_voucher(uuid, text) to authenticated;

with source(account_tail, tx_date, type, amount, balance_after, description) as (
 values
  ('86187', '2025-03-14'::date, '支出', 5642::numeric, 2752711::numeric, '交大ＣＵＲＲＹ費用 - 企網非約轉帳'),
  ('86187', '2025-03-17'::date, '支出', 5500::numeric, 2747211::numeric, '臺銀 - 中華電信費用'),
  ('86187', '2025-03-17'::date, '支出', 999::numeric, 2746212::numeric, '臺銀 - 中華電信費用'),
  ('86187', '2025-03-17'::date, '支出', 4125::numeric, 2742087::numeric, '臺銀 - 中華電信費用'),
  ('86187', '2025-03-19'::date, '支出', 1196::numeric, 2740891::numeric, '臺銀 - 勞保局保險費'),
  ('86187', '2025-03-20'::date, '支出', 60000::numeric, 2680891::numeric, '11402 - 企網本行轉帳'),
  ('86187', '2025-03-21'::date, '支出', 1780000::numeric, 900891::numeric, 'ZW27817601 - 企網本行轉帳'),
  ('86187', '2025-03-28'::date, '收入', 10644::numeric, 911535::numeric, '兆豐銀 - ＡＴＭ跨行轉'),
  ('86187', '2025-03-28'::date, '收入', 2000000::numeric, 2911535::numeric, '國世銀 - ＡＴＭ跨行轉'),
  ('86187', '2025-03-31'::date, '支出', 1121015::numeric, 1790520::numeric, 'HB04HB05 - 企網轉帳'),
  ('86187', '2025-03-31'::date, '收入', 2000000::numeric, 3790520::numeric, '國世銀 - ＡＴＭ跨行轉'),
  ('86187', '2025-03-31'::date, '收入', 200000::numeric, 3990520::numeric, '國世銀 - ＡＴＭ跨行轉'),
  ('04796', '2025-03-04'::date, '支出', 27559::numeric, 48234::numeric, '代繳勞保(11401)'),
  ('04796', '2025-03-04'::date, '支出', 9543::numeric, 38691::numeric, '代繳勞退(11312)'),
  ('61703', '2025-03-20'::date, '支出', 4283::numeric, 0::numeric, '整批轉帳 - 網際轉'),
  ('61703', '2025-03-20'::date, '支出', 12012862::numeric, 0::numeric, '轉綜活'),
  ('61703', '2025-03-20'::date, '支出', 18912::numeric, 0::numeric, '11402薪資 - 網際轉'),
  ('61703', '2025-03-20'::date, '支出', 11872::numeric, 0::numeric, '11402薪資 - 網際轉'),
  ('61703', '2025-03-20'::date, '支出', 13360::numeric, 0::numeric, '11402薪資 - 網際轉'),
  ('61703', '2025-03-20'::date, '支出', 44280::numeric, 0::numeric, '11402薪資 - 網際轉'),
  ('61703', '2025-03-20'::date, '支出', 200015::numeric, 12950319::numeric, '11402薪資 - 網際轉')
)
insert into public.bank_transactions (
 bank_account_id, tx_date, type, amount, balance_after, description
)
select account.id, source.tx_date, source.type, source.amount, source.balance_after, source.description
from source
join public.bank_accounts account
 on right(account.account_number, 5) = source.account_tail
where not exists (
 select 1
 from public.bank_transactions existing
 where existing.bank_account_id = account.id
   and existing.tx_date = source.tx_date
   and existing.type = source.type
   and existing.amount = source.amount
   and existing.balance_after is not distinct from source.balance_after
   and existing.description is not distinct from source.description
);

revoke execute on function public.get_my_role() from anon;
revoke execute on function public.get_my_department() from anon;

grant execute on function public.get_my_role() to authenticator, authenticated, service_role;
grant execute on function public.get_my_department() to authenticator, authenticated, service_role;

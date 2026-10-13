-- Advisor de segurança: as funções com privilégio (security definer) ficam no esquema "privado", que a API não expõe.
grant usage on schema privado to authenticated;

create or replace function privado.central_eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.central_admins a where a.user_id = (select auth.uid()));
$$;
revoke execute on function privado.central_eh_admin() from public, anon;
grant execute on function privado.central_eh_admin() to authenticated;

drop policy "demo_acessos: propria linha ou admin" on public.demo_acessos;
create policy "demo_acessos: propria linha ou admin" on public.demo_acessos
  for select to authenticated
  using (user_id = (select auth.uid()) or (select privado.central_eh_admin()));
drop function public.central_eh_admin();

alter function public.demo_sessao_valida(boolean) set schema privado;
alter function privado.demo_sessao_valida(boolean) rename to sessao_valida;
revoke execute on function privado.sessao_valida(boolean) from public, anon;
grant execute on function privado.sessao_valida(boolean) to authenticated;

-- a porta pública (/rest/v1/rpc/demo_sessao_valida) roda com os direitos de quem chama e só repassa
create or replace function public.demo_sessao_valida(p_novo_login boolean default false)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select privado.sessao_valida(p_novo_login);
$$;
revoke execute on function public.demo_sessao_valida(boolean) from public, anon;
grant execute on function public.demo_sessao_valida(boolean) to authenticated;

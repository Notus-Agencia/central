-- O Auth grava app_metadata só depois do insert: a Central reserva o login em demo_acessos (user_id ainda vazio)
-- e só então cria o usuário. Fora disso (signup com a chave pública), o cadastro é recusado.
create or replace function privado.bloquear_cadastro_publico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'gsc', '') <> '' then
    return new;
  end if;
  if exists (
    select 1 from public.demo_acessos d
     where d.user_id is null
       and not d.revogado
       and d.criado_em > now() - interval '10 minutes'
       and d.login || '@demo.gestaosemcaos.com.br' = lower(new.email)
  ) then
    return new;
  end if;
  raise exception 'Cadastro fechado: os acessos são criados pela Central da Gestão Sem Caos.';
end;
$$;
revoke execute on function privado.bloquear_cadastro_publico() from public, anon, authenticated;
grant execute on function privado.bloquear_cadastro_publico() to supabase_auth_admin;

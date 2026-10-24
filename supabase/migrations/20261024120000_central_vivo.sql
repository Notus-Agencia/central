-- Mantém o projeto acordado: o plano grátis do Supabase pausa o projeto depois de 7 dias sem uso, e com ele pausado
-- ninguém entra na Central. O workflow manter-acordado.yml chama esta função a cada 2 dias com a chave pública.
-- Só devolve a hora: não lê nem grava tabela nenhuma.
create or replace function public.central_vivo()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$ select now() $$;

revoke all on function public.central_vivo() from public;
grant execute on function public.central_vivo() to anon, authenticated;

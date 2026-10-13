-- Central da Gestão Sem Caos: acessos de demonstração com validade e administradores.

create table public.central_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.central_admins enable row level security;

create table public.demo_acessos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  nome text not null check (char_length(nome) between 1 and 120),
  login text not null unique check (login ~ '^[a-z0-9][a-z0-9.-]{2,40}$'),
  expira_em timestamptz not null,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  ultimo_acesso timestamptz,
  acessos integer not null default 0,
  revogado boolean not null default false,
  revogado_em timestamptz
);
alter table public.demo_acessos enable row level security;
create index demo_acessos_criado_por_idx on public.demo_acessos (criado_por);

-- quem chama é administrador da Central?
create or replace function public.central_eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.central_admins a where a.user_id = (select auth.uid()));
$$;
revoke execute on function public.central_eh_admin() from public, anon;
grant execute on function public.central_eh_admin() to authenticated;

-- leitura: a pessoa da demonstração só vê a própria linha; o administrador vê todas.
create policy "demo_acessos: propria linha ou admin" on public.demo_acessos
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.central_eh_admin()));

create policy "central_admins: propria linha" on public.central_admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- nada de escrita direta pela API: criar, estender e revogar passam pelas edge functions (service role).
revoke insert, update, delete, truncate on public.demo_acessos from anon, authenticated;
revoke insert, update, delete, truncate on public.central_admins from anon, authenticated;
revoke all on public.demo_acessos from anon;
revoke all on public.central_admins from anon;

-- A demo chama ao entrar (p_novo_login = true, conta um acesso) e a cada poucos minutos (false).
-- Verificação no servidor: só vale se existe a linha, não foi revogada e não passou de expira_em.
create or replace function public.demo_sessao_valida(p_novo_login boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.demo_acessos%rowtype;
  uid uuid := (select auth.uid());
begin
  if uid is null then
    return jsonb_build_object('valido', false, 'motivo', 'sem_sessao');
  end if;
  select * into v from public.demo_acessos where user_id = uid;
  if not found then
    return jsonb_build_object('valido', false, 'motivo', 'sem_acesso');
  end if;
  if v.revogado then
    return jsonb_build_object('valido', false, 'motivo', 'revogado');
  end if;
  if v.expira_em <= now() then
    return jsonb_build_object('valido', false, 'motivo', 'expirado');
  end if;
  update public.demo_acessos
     set ultimo_acesso = now(),
         acessos = acessos + case when p_novo_login then 1 else 0 end
   where id = v.id;
  return jsonb_build_object('valido', true, 'nome', v.nome, 'login', v.login, 'expira_em', v.expira_em);
end;
$$;
revoke execute on function public.demo_sessao_valida(boolean) from public, anon;
grant execute on function public.demo_sessao_valida(boolean) to authenticated;

-- Cadastro público fechado: só entra em auth.users quem a Central cria (app_metadata.gsc, que só o
-- servidor consegue gravar). Um "signup" com a chave pública é recusado aqui.
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

create or replace function privado.bloquear_cadastro_publico()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'gsc', '') = '' then
    raise exception 'Cadastro fechado: os acessos são criados pela Central da Gestão Sem Caos.';
  end if;
  return new;
end;
$$;
revoke execute on function privado.bloquear_cadastro_publico() from public, anon, authenticated;

create trigger bloquear_cadastro_publico
  before insert on auth.users
  for each row execute function privado.bloquear_cadastro_publico();

-- o Auth (supabase_auth_admin) precisa conseguir rodar o gatilho
grant usage on schema privado to supabase_auth_admin;
grant execute on function privado.bloquear_cadastro_publico() to supabase_auth_admin;

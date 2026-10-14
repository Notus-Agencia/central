-- Ligação automática BI → Central (fase dos fundadores): cada BI gera a própria chave de leitura do uso e a entrega pela
-- função pública central-registrar-bi, que confere a chave chamando {url}/api/v1/central/ping antes de gravar.
-- Só acrescenta.
--   aguardando_aprovacao: BI novo que se registrou sozinho (entra com ativo = false; o admin aprova na aba BIs)
--   ligado_auto_em:       quando a chave automática foi gravada (a última vez)
--   ultimo_contato_em:    o último registro confirmado
--   versao:               a versão do BI informada no registro (ex.: v2.14.0)
alter table public.central_bis add column if not exists aguardando_aprovacao boolean not null default false;
alter table public.central_bis add column if not exists ligado_auto_em timestamptz;
alter table public.central_bis add column if not exists ultimo_contato_em timestamptz;
alter table public.central_bis add column if not exists versao text check (versao is null or char_length(versao) <= 20);

grant select (aguardando_aprovacao, ligado_auto_em, ultimo_contato_em, versao) on public.central_bis to authenticated;

-- tentativas de registro (limite contra abuso: por endereço e no total). Só a service role lê e grava.
create table if not exists public.central_registros (
  id bigint generated always as identity primary key,
  url text not null check (char_length(url) <= 200),
  em timestamptz not null default now(),
  ok boolean not null default false
);
create index if not exists central_registros_url_em on public.central_registros (url, em desc);
create index if not exists central_registros_em on public.central_registros (em desc);
alter table public.central_registros enable row level security;
revoke all on public.central_registros from anon, authenticated;

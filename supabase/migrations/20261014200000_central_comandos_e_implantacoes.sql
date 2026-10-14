-- Onda 7 (Central completa): comandos assinados para cada BI, histórico dos comandos e fichas de implantação de
-- clínicas novas. Só acrescenta.
--
-- chave_comandos: a chave PRIVADA Ed25519 (bi_k_…) que o próprio BI gera e entrega no registro
-- (central-registrar-bi). Protegida como chave_leitura: anon e authenticated não leem a coluna; quem lê é só a service
-- role, na função central-comando, que assina os comandos no servidor. tem_comandos (gerada) diz à tela se há chave.
alter table public.central_bis add column if not exists chave_comandos text
  check (chave_comandos is null or chave_comandos ~ '^bi_k_[A-Za-z0-9_-]{64}$');
alter table public.central_bis add column if not exists tem_comandos boolean
  generated always as (chave_comandos is not null) stored;
revoke select (chave_comandos) on public.central_bis from anon, authenticated;
grant select (tem_comandos) on public.central_bis to authenticated;

-- histórico dos comandos: quem (administrador da Central), quando, o quê e o resultado. Só a service role grava
-- (função central-comando); administradores leem.
create table if not exists public.central_comandos (
  id         bigint generated always as identity primary key,
  bi_id      uuid not null references public.central_bis(id) on delete cascade,
  admin_id   uuid,
  admin_nome text,
  comando    text not null check (char_length(comando) <= 40),
  leitura    boolean not null default false,
  detalhe    jsonb,
  ok         boolean not null,
  status     integer,
  resultado  text check (resultado is null or char_length(resultado) <= 300),
  em         timestamptz not null default now()
);
create index if not exists central_comandos_bi_em on public.central_comandos (bi_id, em desc);
alter table public.central_comandos enable row level security;
create policy "central_comandos: so admin" on public.central_comandos
  for select to authenticated using ((select privado.central_eh_admin()));
revoke all on public.central_comandos from anon;
revoke insert, update, delete, truncate on public.central_comandos from authenticated;

-- fichas de implantação (assistente "Nova clínica"): o que a clínica contratou e o que precisa ser criado no servidor.
-- Nenhum segredo aqui: senhas e chaves nascem no servidor na hora de criar (ou no próprio BI). Só a service role grava
-- (função central-implantacao); administradores leem.
create table if not exists public.central_implantacoes (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (char_length(nome) between 2 and 120),
  nome_curto    text not null check (char_length(nome_curto) between 2 and 60),
  sigla         text not null check (char_length(sigla) between 1 and 6),
  marca         text not null check (marca ~ '^[a-z0-9-]{2,30}$'),
  dominio       text not null check (dominio ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' and char_length(dominio) <= 120),
  medicas       jsonb not null default '[]'::jsonb,
  modulos       jsonb not null default '{}'::jsonb,
  plano         text not null default 'fundador' check (plano in ('fundador', 'clinica', 'completa')),
  responsavel   jsonb not null default '{}'::jsonb,
  status        text not null default 'aguardando_hospedagem'
                check (status in ('aguardando_hospedagem', 'hospedando', 'no_ar', 'cancelada')),
  ficha         jsonb not null,
  bi_id         uuid references public.central_bis(id) on delete set null,
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists central_implantacoes_dominio on public.central_implantacoes (dominio) where status <> 'cancelada';
alter table public.central_implantacoes enable row level security;
create policy "central_implantacoes: so admin" on public.central_implantacoes
  for select to authenticated using ((select privado.central_eh_admin()));
revoke all on public.central_implantacoes from anon;
revoke insert, update, delete, truncate on public.central_implantacoes from authenticated;

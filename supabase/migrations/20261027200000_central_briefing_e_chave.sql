-- Briefing por link e chave de acesso da Central (pedidos do dono, 27/10/2026). Só acrescenta.

-- ── Briefing: a clínica responde por um link com código, sem login (função central-briefing). Administradores leem;
-- só a service role grava. Nada de segredo nem de paciente: são as respostas do briefing da implantação.
create table if not exists public.central_briefings (
  id             uuid primary key default gen_random_uuid(),
  clinica        text not null check (char_length(clinica) between 2 and 120),
  codigo         text not null unique check (codigo ~ '^[A-Za-z0-9_-]{24,64}$'),
  respostas      jsonb not null default '{}'::jsonb,
  implantacao_id uuid references public.central_implantacoes(id) on delete set null,
  criado_por     uuid,
  criado_em      timestamptz not null default now(),
  aberto_em      timestamptz,
  atualizado_em  timestamptz,
  enviado_em     timestamptz,
  arquivado_em   timestamptz
);
alter table public.central_briefings enable row level security;
create policy "central_briefings: so admin" on public.central_briefings
  for select to authenticated using ((select privado.central_eh_admin()));
revoke all on public.central_briefings from anon;
revoke insert, update, delete, truncate on public.central_briefings from authenticated;

-- ── Chave de acesso (passkey/WebAuthn) do login da Central: mesma peça dos portais (pedido do dono: "em todos os sites").
-- Guarda só a chave PÚBLICA do aparelho. Tabelas fechadas (RLS sem política): só a função central-chave-acesso lê e grava.
create table if not exists public.central_chaves (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  credencial_id text not null unique,
  chave_publica bytea not null,
  contador      bigint not null default 0,
  transportes   text[] not null default '{}',
  apelido       text not null,
  criado_em     timestamptz not null default now(),
  usado_em      timestamptz
);
create index if not exists central_chaves_dono on public.central_chaves (user_id);

create table if not exists public.central_chave_desafios (
  desafio   text primary key,
  user_id   uuid,                      -- ao criar: de quem; ao entrar: vazio (a chave diz quem é)
  tipo      text not null check (tipo in ('criar', 'entrar')),
  expira_em timestamptz not null
);

alter table public.central_chaves enable row level security;
alter table public.central_chave_desafios enable row level security;
revoke all on public.central_chaves, public.central_chave_desafios from anon, authenticated;
revoke all on sequence public.central_chaves_id_seq from anon, authenticated;

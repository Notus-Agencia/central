-- Lista de BIs da Central. Só administradores leem; não há escrita pela API (os dados entram por SQL
-- avulso no painel do Supabase ou, depois, por uma edge function de administrador). Os dados não ficam no repositório.
create table public.central_bis (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 1 and 120),
  url text not null check (url ~ '^https://'),
  tipo text not null check (tipo in ('clinica', 'demo')),
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.central_bis enable row level security;

create policy "central_bis: so admin" on public.central_bis
  for select to authenticated
  using ((select privado.central_eh_admin()));

revoke all on public.central_bis from anon;
revoke insert, update, delete, truncate on public.central_bis from authenticated;

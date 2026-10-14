-- Chave de leitura do uso (aba Uso da Central): a chave "bi_..." de um desenvolvedor, criada no BI em Ajustes › Chave de
-- API e MCP, que a função central-uso usa para chamar GET {url}/api/v1/uso-pessoas. Só acrescenta.
-- A chave NUNCA volta para o navegador: o select da tabela passa a ser por coluna (anon e authenticated não leem
-- chave_leitura); quem grava e lê é só a service role, nas funções central-bi-chave e central-uso.
-- tem_chave (gerada) diz à tela se há chave, sem expor a chave.
alter table public.central_bis add column if not exists chave_leitura text
  check (chave_leitura is null or chave_leitura ~ '^bi_[A-Za-z0-9_-]{8,200}$');
alter table public.central_bis add column if not exists tem_chave boolean
  generated always as (chave_leitura is not null) stored;

revoke select on public.central_bis from anon, authenticated;
revoke select (chave_leitura) on public.central_bis from anon, authenticated;
grant select (id, nome, url, tipo, ordem, ativo, criado_em, tem_chave) on public.central_bis to authenticated;

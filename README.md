# Central da Gestão Sem Caos

Portal do administrador (v1): lista dos BIs e acessos de demonstração com validade.

A lista de BIs vem da tabela `central_bis` (só administradores leem; sem escrita pela API). Os dados ficam só no
banco: entram por SQL avulso no painel do Supabase, nunca por arquivo neste repositório.

- `site/` — o que o GitHub Pages publica (`./montar-central.sh` gera a partir de `fonte-central/`).
- `supabase/` — migrações e edge functions do projeto Supabase da Central (`kwysrvuvgdovmwhptqaw`).
  As funções `central-criar-acesso`, `central-estender` e `central-revogar` conferem se quem chama é administrador
  (tabela `central_admins`) e usam a service role, que existe só no servidor do Supabase.
- `demo/` — montagem do repositório `bi-demo`: `./demo/montar-demo.sh <código do BI> <saída>` (código = tarball do
  `develop` com `pnpm install`). Troca os nomes reais por fictícios com os pares de `demo/trocas.local.json` (fora do git; formato em
  `demo/trocas.exemplo.json`) e confere com `scripts/checar-nomes-reais.mjs --demo`.
  `demo/e2e.mjs` e `demo/api.sh` são o teste de ponta a ponta (precisam de um administrador de teste, apagado depois).

No front fica só a chave pública (publishable) do Supabase. Nenhum segredo neste repositório.

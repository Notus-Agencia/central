# Central da Gestão Sem Caos

Portal do administrador (Onda 7, "Central completa"). Uma instalação do BI por clínica (app e banco próprios, mesmo
código) e esta Central por cima. A Central nunca recebe dado de paciente.

Abas:
- **Clínicas:** por clínica, mostra saúde (fontes em dia, versão, pessoas com acesso), identidade, módulos (liga e
  desliga, com confirmação), acessos (pessoas e papéis), **Entrar como suporte**, **Encerrar suporte agora** e o
  histórico do que a Central fez. Embaixo ficam as **Implantações**, com o assistente **Nova clínica**.
- **Acessos de demonstração:** logins com validade para a demo.
- **BIs:** a lista de BIs. Quem se registrou sozinho aguarda aprovação aqui; a chave manual fica como plano B.
- **Uso:** quem usou o BI e como.

## Como a Central fala com cada BI (sem EasyPanel)

1. **Registro.** O BI se registra sozinho na função pública `central-registrar-bi`: na subida e uma vez por dia, até
   dar certo. Ele manda:
   - `chave`: a de leitura do uso, `bi_c_…`. A Central confere chamando `/api/v1/central/ping` com ela;
   - `chave_comandos`: a chave **privada** Ed25519, `bi_k_…`. O BI gera o par na hora, guarda só a pública e entrega a
     privada aqui.

   Ninguém cria nem cola chave. As duas ficam em `central_bis` (`chave_leitura` e `chave_comandos`) e a tela não
   consegue ler essas colunas: ela só vê `tem_chave` e `tem_comandos`. A resposta `{ ok, comandos: true }` diz ao BI
   que pode gravar a pública.
2. **Comandos.** A função `central-comando` (só administradores) assina no servidor (`_comandos.ts`) e chama
   `{url}/api/v1/central/*`:

   | Comando | No BI |
   |---|---|
   | `resumo`, `saude`, `identidade`, `modulos`, `acessos`, `historico_suporte` | `GET resumo · saude · identidade · modulos · acessos · suporte` |
   | `modulo { chave, ligado }` | `PUT modulos/:chave` (mesmas dependências de Ajustes › Módulos) |
   | `suporte { minutos: 15/30/60/120, motivo? }` | `POST suporte` → link de entrada de 5 min, uso único |
   | `encerrar_suporte` | `DELETE suporte` |

   A assinatura cobre o método, o caminho, a hora (60 s de tolerância), um identificador de uso único (contra
   repetição), quem mandou e o hash do corpo. O formato está em `_comandos.ts` e, no BI, em
   `backend/src/modules/central/comandos-regras.ts`. **Os dois precisam ficar iguais.** Todo comando vai para
   `central_comandos` com quem, quando, o quê e o resultado.
3. **Suporte com registro (contrato, cláusula 5).** Cada pessoa da Central tem uma conta temporária própria no BI.
   O log que a clínica vê guarda "Gestão Sem Caos entrou para suporte (Fulano), 14/10, das 14:00 às 14:30" pelo
   contrato inteiro (fora da retenção de 180 dias). A sessão acaba sozinha no fim do tempo.
4. **BI antigo.** Um BI sem a versão nova não tem `chave_comandos`, e a tela mostra "precisa da próxima atualização do
   BI". Depois que ele for atualizado, ele se registra de novo sozinho (a ligação antiga não conta sem a chave pública)
   e passa a receber comandos no mesmo cadastro.

## Nova clínica (estrutura pronta, hospedagem ainda manual)

O assistente coleta nome, nome curto, sigla, marca, domínio, médicas, plano e módulos (fundador = todos ligados; o dono
tira o que não fizer sentido) e o responsável. A função `central-implantacao` valida (`_implantacao.ts`) e guarda a
**ficha de implantação** em `central_implantacoes`, com a situação **aguardando hospedagem**. A ficha traz o projeto, o
banco, o app, o domínio, as variáveis, a configuração inicial (SQL de `clinica_config` e `modulos`) e o passo a passo.
**Nenhum segredo entra na ficha:** os marcados "gerar no servidor" nascem lá. Situações: aguardando hospedagem →
hospedando → no ar (ligada ao BI que se registrou) ou cancelada.

### Conectar ao EasyPanel depois

Tudo o que é externo está isolado em `supabase/functions/_hospedagem.ts`, chamado pela função `central-hospedagem`
(botão **Criar no servidor**). Hoje ele responde "não conectado". Para ligar:

1. No EasyPanel, criar uma chave de API só para a Central. Guardar como segredo das funções:
   `supabase secrets set EASYPANEL_URL=… EASYPANEL_TOKEN=…`. Nunca no repositório nem na tela.
2. Em `_hospedagem.ts`, implementar `criarInstalacao(ficha)` seguindo o roteiro do cabeçalho: projeto → Postgres →
   app (GitHub, ramo main, Dockerfile) → variáveis → domínio com HTTPS → deploy. As senhas e chaves marcadas "gerar no
   servidor" são geradas ali, na hora, e enviadas direto ao EasyPanel, sem gravar em lugar nenhum.
3. Trocar `HOSPEDAGEM_CONECTADA` para `true` e republicar `central-hospedagem`.
4. No mesmo passo, pôr o banco novo no backup diário (`docs/BACKUP.md` do BI).
5. Em até 1 minuto da subida, o BI novo se registra sozinho. Depois é só aprovar na aba BIs e ligar a ficha a ele.

## Pastas

- `site/`: o que o GitHub Pages publica (`./montar-central.sh` gera a partir de `fonte-central/` e roda `node --check`).
- `supabase/`: migrações e edge functions do projeto Supabase da Central (`kwysrvuvgdovmwhptqaw`). As funções com
  `comAdmin` conferem se quem chama está em `central_admins` e usam a service role, que existe só no servidor do
  Supabase. `central-registrar-bi` é pública (`verify_jwt = false`) e confere o BI pelo ping.
  - `_comum.ts`: sessão de administrador e utilidades. `_comandos.ts`: assinatura e catálogo dos comandos.
    `_implantacao.ts`: ficha. `_hospedagem.ts`: o ponto do EasyPanel.
- `demo/`: montagem do repositório `bi-demo`. `./demo/montar-demo.sh <código do BI> <saída>`, onde o código é o
  tarball do `develop` com `pnpm install`. Troca os nomes reais por fictícios com os pares de
  `demo/trocas.local.json` (fora do git; o formato está em `demo/trocas.exemplo.json`) e confere com
  `scripts/checar-nomes-reais.mjs --demo`. `demo/e2e.mjs` e `demo/api.sh` são o teste de ponta a ponta: precisam de um
  administrador de teste, que é apagado depois.

No front fica só a chave pública (publishable) do Supabase. Nenhum segredo neste repositório.

## Onde fica e como fica acordada

- Repositórios `Notus-Agencia/central` (este) e `Notus-Agencia/bi-demo`, desde 24/10/2026; os endereços
  `central.gestaosemcaos.com.br` e `demo.gestaosemcaos.com.br` não mudaram.
- O plano grátis do Supabase pausa o projeto depois de 7 dias sem uso. O workflow `manter-acordado.yml` chama a função
  `central_vivo` (só devolve a hora) a cada 2 dias. O GitHub desliga agendamentos de repositório público depois de 60
  dias sem commit: se chegar o e-mail avisando, religar em Actions › Manter acordado.

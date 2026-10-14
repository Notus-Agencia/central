// Ponto ÚNICO de integração com a hospedagem (EasyPanel). Hoje não chama nada de fora: devolve "não conectado" e a
// Central mostra a ficha para criar à mão. Quando ligar, só este arquivo muda (e a função central-hospedagem chama).
//
// TODO(EasyPanel) — para conectar depois:
//   1. Criar no EasyPanel uma chave de API só para a Central e guardá-la como segredo da edge function
//      (supabase secrets set EASYPANEL_URL=https://painel... EASYPANEL_TOKEN=...). Nunca no repositório nem na tela.
//   2. Implementar criarInstalacao(ficha) com a API do EasyPanel (tRPC em {EASYPANEL_URL}/api/trpc/*):
//        a) projects.createProject { name: ficha.servidor.projeto }
//        b) services.postgres.createService { projectName, serviceName: "db", image: "postgres:16" } → ler a URL interna
//        c) services.app.createService { projectName, serviceName: "app" } + updateSourceGithub (ramo main, Dockerfile)
//        d) services.app.updateEnv: as variáveis da ficha; as de origem "gerar_no_servidor" são geradas AQUI na hora
//           (crypto.getRandomValues) e mandadas direto ao EasyPanel, sem gravar em lugar nenhum da Central
//        e) services.app.updateDomains { host: ficha.servidor.dominio.nome, https: true, port: 4200 }
//        f) services.app.deployService
//      Conferir os nomes exatos na versão do EasyPanel instalada antes de ligar.
//   3. Ligar HOSPEDAGEM_CONECTADA = true abaixo e trocar o status da ficha para "hospedando"; o BI, ao subir, se registra
//      sozinho na Central (central-registrar-bi) e a ficha passa para "no_ar" quando o admin ligar a ficha ao BI.
//   4. Backup: incluir o banco novo na rotina de backup (docs/BACKUP.md do BI) no mesmo passo.

export const HOSPEDAGEM_CONECTADA = false;

export type ResultadoHospedagem =
  | { conectado: false; mensagem: string }
  | { conectado: true; ok: boolean; mensagem: string; detalhe?: Record<string, unknown> };

// deno-lint-ignore require-await
export async function criarInstalacao(_ficha: Record<string, unknown>): Promise<ResultadoHospedagem> {
  if (!HOSPEDAGEM_CONECTADA)
    return { conectado: false, mensagem: "A hospedagem automática ainda não está conectada. Use a ficha para criar no servidor." };
  // TODO(EasyPanel): passos do cabeçalho deste arquivo.
  return { conectado: true, ok: false, mensagem: "Integração com o EasyPanel ainda não implementada." };
}

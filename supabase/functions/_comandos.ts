// Comandos assinados da Central para cada BI (Onda 7). A chave privada Ed25519 de cada BI (central_bis.chave_comandos)
// nasceu no próprio BI e chegou pela central-registrar-bi; ela só é lida aqui, no servidor, e nunca vai ao navegador.
// O formato da assinatura é o de backend/src/modules/central/comandos-regras.ts no repositório do BI — manter iguais:
//   texto = "gsc-central-v1\nMÉTODO\ncaminho com busca\ndata(ms)\nnonce\nquem(base64url de {nome,email})\nsha256hex(corpo)"
//   cabeçalhos x-central-data, x-central-nonce, x-central-quem, x-central-assinatura (base64url)

export type Quem = { nome: string; email: string | null };

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function deB64url(s: string): Uint8Array {
  const t = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
}
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

export function cabecalhoQuem(q: Quem): string {
  return b64url(new TextEncoder().encode(JSON.stringify({ nome: q.nome, email: q.email })));
}

/** os cabeçalhos assinados de um comando */
export async function assinar(privada: string, p: { metodo: string; caminho: string; corpo: string; quem: Quem; data?: number; nonce?: string }) {
  const data = String(p.data ?? Date.now());
  const nonce = p.nonce ?? b64url(crypto.getRandomValues(new Uint8Array(18)));
  const quem = cabecalhoQuem(p.quem);
  const corpoHash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(p.corpo)));
  const texto = ["gsc-central-v1", p.metodo.toUpperCase(), p.caminho, data, nonce, quem, corpoHash].join("\n");
  const chave = await crypto.subtle.importKey("pkcs8", deB64url(privada.replace(/^bi_k_/, "")), { name: "Ed25519" }, false, ["sign"]);
  const assinatura = b64url(new Uint8Array(await crypto.subtle.sign("Ed25519", chave, new TextEncoder().encode(texto))));
  return { "x-central-data": data, "x-central-nonce": nonce, "x-central-quem": quem, "x-central-assinatura": assinatura };
}

/** o catálogo dos comandos: o que a tela pede vira método + caminho + corpo no BI */
export type Pedido = { metodo: "GET" | "PUT" | "POST" | "DELETE"; caminho: string; corpo?: Record<string, unknown>; leitura: boolean };
const MODULO = /^[a-z_]{2,30}$/;
const MINUTOS = [15, 30, 60, 120];

export function pedidoDoComando(corpo: Record<string, unknown>): Pedido | string {
  switch (corpo.comando) {
    case "resumo": return { metodo: "GET", caminho: "/api/v1/central/resumo", leitura: true };
    case "saude": return { metodo: "GET", caminho: "/api/v1/central/saude", leitura: true };
    case "identidade": return { metodo: "GET", caminho: "/api/v1/central/identidade", leitura: true };
    case "modulos": return { metodo: "GET", caminho: "/api/v1/central/modulos", leitura: true };
    case "acessos": return { metodo: "GET", caminho: "/api/v1/central/acessos", leitura: true };
    case "historico_suporte": return { metodo: "GET", caminho: "/api/v1/central/suporte", leitura: true };
    case "modulo": {
      if (typeof corpo.chave !== "string" || !MODULO.test(corpo.chave)) return "Módulo inválido.";
      if (typeof corpo.ligado !== "boolean") return "Diga se o módulo fica ligado.";
      return { metodo: "PUT", caminho: `/api/v1/central/modulos/${corpo.chave}`, corpo: { ligado: corpo.ligado }, leitura: false };
    }
    case "suporte": {
      const minutos = Number(corpo.minutos ?? 30);
      if (!MINUTOS.includes(minutos)) return "O tempo de suporte vai de 15, 30, 60 ou 120 minutos.";
      const motivo = typeof corpo.motivo === "string" ? corpo.motivo.trim().slice(0, 200) : "";
      return { metodo: "POST", caminho: "/api/v1/central/suporte", corpo: motivo ? { minutos, motivo } : { minutos }, leitura: false };
    }
    case "encerrar_suporte": return { metodo: "DELETE", caminho: "/api/v1/central/suporte", leitura: false };
    default: return "Comando desconhecido.";
  }
}

/** um resumo curto do resultado para o histórico (nunca a resposta inteira) */
export function resumoDoResultado(c: Record<string, unknown>, ok: boolean, dados: Record<string, unknown> | null, erro?: string): string {
  if (!ok) return (erro ?? "falhou").slice(0, 300);
  if (c.comando === "modulo") return `${c.chave} ${c.ligado ? "ligado" : "desligado"}${dados && dados.mudou === false ? " (já estava assim)" : ""}`;
  if (c.comando === "suporte") return `acesso de ${Number(c.minutos ?? 30)} min${typeof c.motivo === "string" && c.motivo ? ` · ${c.motivo.slice(0, 120)}` : ""}`;
  if (c.comando === "encerrar_suporte") return `${dados?.encerrados ?? 0} acesso(s) encerrado(s)`;
  return "lido";
}

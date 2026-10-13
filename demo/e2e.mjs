// Teste de ponta a ponta da demo + Central: Chrome headless (CDP puro) na porta 9483, sites em 127.0.0.1:47811/47812.
// Pausas: escreve <pasta>/espera-<fase> e aguarda <pasta>/ok-<fase> (o SQL de expirar/reativar é feito por fora).
// uso: node e2e.mjs <site-demo> <site-central> <pasta-saida>   (pasta local ou https://…)   (a senha do admin de teste vem de <pasta-saida>/.senha-admin-teste)
import { spawn } from "node:child_process";
import http from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const [, , SITE_DEMO, SITE_CENTRAL, SAIDA] = process.argv;
const FOTOS = path.join(SAIDA, "fotos"); mkdirSync(FOTOS, { recursive: true });
const SENHA_ADMIN = readFileSync(path.join(SAIDA, ".senha-admin-teste"), "utf8").trim();
const EMAIL_ADMIN = "admin-teste-e2e@central.gestaosemcaos.com.br";
// nomes reais = palavras com maiúscula do lado "real" de demo/trocas.local.json (fora do git) que não aparecem no lado fictício
function nomesReais() {
  const arq = path.join(path.dirname(new URL(import.meta.url).pathname), "trocas.local.json");
  if (!existsSync(arq)) return [];
  const pares = JSON.parse(readFileSync(arq, "utf8")), palavras = (t) => t.match(/[A-ZÀ-Ý][A-Za-zÀ-ÿ]{3,}/g) || [];
  const ficticias = new Set(pares.flatMap(([, f]) => palavras(f)));
  return [...new Set(pares.flatMap(([r]) => palavras(r)))].filter((w) => !ficticias.has(w));
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const resultados = [];
function confere(nome, ok, extra = "") { resultados.push({ nome, ok }); console.log((ok ? "OK   " : "FALHA") + " " + nome + (extra ? " — " + extra : "")); }

// servidores estáticos
const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
function servir(raiz, porta) {
  return http.createServer(async (q, r) => {
    let rel = decodeURIComponent(new URL(q.url, "http://x").pathname); if (rel.endsWith("/")) rel += "index.html";
    try { const d = await readFile(path.join(raiz, rel)); r.writeHead(200, { "Content-Type": tipos[path.extname(rel)] ?? "application/octet-stream", "Cache-Control": "no-store" }); r.end(d); }
    catch { r.writeHead(404); r.end(); }
  }).listen(porta, "127.0.0.1");
}
// <site> pode ser uma pasta (servida em 127.0.0.1) ou um endereço já publicado (https://…)
const remoto = (s) => /^https?:/.test(s);
const s1 = remoto(SITE_DEMO) ? null : servir(SITE_DEMO, 47811), s2 = remoto(SITE_CENTRAL) ? null : servir(SITE_CENTRAL, 47812);
const DEMO = remoto(SITE_DEMO) ? SITE_DEMO : "http://127.0.0.1:47811/", CENTRAL = remoto(SITE_CENTRAL) ? SITE_CENTRAL : "http://127.0.0.1:47812/";

// Chrome
const perfil = mkdtempSync("/tmp/chr-gsc-e2e-");
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--remote-debugging-port=9483", `--user-data-dir=${perfil}`, "--hide-scrollbars", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
setTimeout(() => { console.log("tempo esgotado"); fim(3); }, 900000).unref?.();
function fim(cod) { try { chrome.kill(); } catch {} s1?.close(); s2?.close(); writeFileSync(path.join(SAIDA, "resultado.json"), JSON.stringify(resultados, null, 1)); process.exit(cod); }

async function aba(url) {
  let alvo;
  for (let i = 0; i < 100 && !alvo; i++) { await espera(200); try { alvo = await (await fetch("http://127.0.0.1:9483/json/new?" + encodeURIComponent("about:blank"), { method: "PUT" })).json(); } catch {} }
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0; const pend = new Map(); const erros = [];
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data);
    if (m.method === "Runtime.exceptionThrown") { erros.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text); }
    if (m.method === "Page.javascriptDialogOpening") cmd("Page.handleJavaScriptDialog", { accept: true });
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await cmd("Page.enable"); await cmd("Runtime.enable"); await cmd("Network.enable"); await cmd("Network.setCacheDisabled", { cacheDisabled: true });
  await cmd("Emulation.setDeviceMetricsOverride", { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
  const a = {
    erros, cmd,
    async ir(u) { await cmd("Page.navigate", { url: u }); await espera(1200); },
    async js(expr) { const r = await cmd("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result?.result?.value; },
    async ate(expr, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await a.js(expr)) return true; } catch {} await espera(250); } return false; },
    async foto(nome) { const r = await cmd("Page.captureScreenshot", { format: "png" }); writeFileSync(path.join(FOTOS, nome + ".png"), Buffer.from(r.result.data, "base64")); },
    async celular(sim) { await cmd("Emulation.setDeviceMetricsOverride", sim ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } : { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false }); },
  };
  if (url) await a.ir(url);
  return a;
}
async function pausa(fase) {
  writeFileSync(path.join(SAIDA, "espera-" + fase), String(Date.now()));
  console.log("PAUSA " + fase);
  while (!existsSync(path.join(SAIDA, "ok-" + fase))) await espera(500);
}
// preenche um input do jeito que um usuário faria (dispara input/change)
const preencher = (sel, valor) => `(function(){var e=document.querySelector(${JSON.stringify(sel)});var d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');d.set.call(e,${JSON.stringify(valor)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`;

try {
  for (let i = 0; i < 100; i++) { try { await fetch("http://127.0.0.1:9483/json/version"); break; } catch { await espera(200); } }

  // ── 1. Central: login do admin de teste e criação de um acesso de 2 h ──
  const c = await aba(CENTRAL);
  await c.ate(`!!document.querySelector('input[type=email]')`);
  await c.foto("01-central-login");
  await c.js(preencher("input[type=email]", EMAIL_ADMIN)); await c.js(preencher("input[type=password]", SENHA_ADMIN));
  await c.js(`document.querySelector('form').requestSubmit(), true`);
  confere("Central: admin entra", await c.ate(`!!document.querySelector('.criar')`));
  await c.js(preencher(".criar-linha input", "Teste E2E Demonstração"));
  await c.js(`[...document.querySelectorAll('.chip')].find(b=>b.textContent==='2 h').click(), true`);
  await c.js(`document.querySelector('form.criar').requestSubmit(), true`);
  confere("Central: cria acesso de 2 h", await c.ate(`!!document.querySelector('.criado .credencial code')`));
  const login = await c.js(`document.querySelectorAll('.credencial code')[0].textContent`);
  const senha = await c.js(`document.querySelectorAll('.credencial code')[1].textContent`);
  confere("Central: login e senha legíveis", /^[a-z0-9]+\.[a-z0-9]{4}$/.test(login) && /^[A-Z][a-z]{5}\d{4}$/.test(senha), login + " / senha de " + senha.length + " caracteres");
  const msg = await c.js(`document.querySelector('.mensagem').textContent`);
  confere("Central: texto do WhatsApp tem endereço, login e senha", msg.includes(login) && msg.includes(senha) && msg.includes("bi-demo"));
  await c.ate(`[...document.querySelectorAll('#lista .linha-txt code')].some(e=>e.textContent===${JSON.stringify(login)})`);
  await c.foto("02-central-criado");
  writeFileSync(path.join(SAIDA, "login-teste.txt"), login);

  // ── 2. Demo: entra, BI carrega na visão da gestão ──
  const d = await aba(DEMO);
  await d.ate(`!document.getElementById('gsc-portao').hidden`);
  await d.foto("03-demo-login");
  await d.js(`localStorage.setItem('lixo-anterior','1'), true`);
  await d.js(preencher("#gsc-login", login)); await d.js(preencher("#gsc-senha", senha));
  await d.js(`document.getElementById('gsc-form').requestSubmit(), true`);
  const carregou = await d.ate(`!document.getElementById('gsc-faixa').hidden && document.getElementById('raiz').children.length>0 && document.body.innerText.length>400`, 30000);
  confere("Demo: login abre o BI", carregou);
  await espera(2500);
  confere("Demo: estado anterior apagado no login", (await d.js(`localStorage.getItem('lixo-anterior')`)) === null);
  const texto = await d.js(`document.body.innerText`);
  confere("Demo: sem 'Ver como' de teste", !/Ver como/.test(texto));
  confere("Demo: faixa 'Demonstração · dados fictícios'", texto.includes("Demonstração · dados fictícios"));
  const reais = nomesReais(), achados = reais.filter((n) => texto.toLowerCase().includes(n.toLowerCase()));
  confere("Demo: clínica fictícia" + (reais.length ? "" : " (sem demo/trocas.local.json: só confere o nome fictício)"), !achados.length, (texto.match(/Clínica Orvalho|Orvalho/) || ["(nome da clínica não aparece na tela inicial)"])[0]);
  await d.foto("04-demo-bi");
  await d.celular(true); await espera(800); await d.foto("04b-demo-bi-celular"); await d.celular(false);

  // ── 3. Muda algo, recarrega (continua), sai e entra de novo (volta ao padrão) ──
  await d.js(`localStorage.setItem('bi:menu','claro'), localStorage.setItem('bi:modulos-teste', JSON.stringify({agenda:false})), true`);
  await d.cmd("Page.reload", {}); await espera(1500);
  await d.ate(`!document.getElementById('gsc-faixa').hidden`, 30000); await espera(1500);
  confere("Demo: recarregar mantém a sessão e o que mudou", (await d.js(`document.documentElement.dataset.menu`)) === "claro");
  await d.foto("05-demo-mudado");
  await d.js(`document.getElementById('gsc-sair').click(), true`);
  confere("Demo: Sair volta ao login", await d.ate(`!document.getElementById('gsc-portao').hidden && document.getElementById('gsc-faixa').hidden`));
  await d.js(preencher("#gsc-login", login)); await d.js(preencher("#gsc-senha", senha));
  await d.js(`document.getElementById('gsc-form').requestSubmit(), true`);
  await d.ate(`!document.getElementById('gsc-faixa').hidden && document.body.innerText.length>400`, 30000); await espera(2000);
  const menu2 = await d.js(`document.documentElement.dataset.menu || '(padrão)'`);
  const mod2 = await d.js(`localStorage.getItem('bi:modulos-teste')`);
  confere("Demo: novo login volta às configurações padrão", menu2 !== "claro" && (mod2 === null || !/"agenda":false/.test(mod2)), "menu=" + menu2 + ", módulos=" + mod2);

  // ── 4. Expira no meio do uso ──
  await pausa("expirar"); // por fora: update demo_acessos set expira_em = now() - interval '1 minute'
  await espera(16000);
  await d.js(`window.dispatchEvent(new Event('focus')), true`);
  confere("Demo: expirou no meio do uso → sai com aviso", await d.ate(`!document.getElementById('gsc-portao').hidden && /expirou/.test(document.getElementById('gsc-aviso-texto').textContent)`, 20000));
  await d.foto("06-demo-expirou");
  await d.js(preencher("#gsc-login", login)); await d.js(preencher("#gsc-senha", senha));
  await d.js(`document.getElementById('gsc-form').requestSubmit(), true`);
  confere("Demo: login de acesso expirado é recusado", await d.ate(`!document.getElementById('gsc-portao').hidden && /expirou/.test(document.getElementById('gsc-aviso-texto').textContent) && !document.getElementById('gsc-entrar').disabled`, 20000));
  await c.js(`window.dispatchEvent(new Event('focus')), true`); await espera(2500);
  confere("Central: status 'Expirado'", /Expirado/.test(await c.js(`document.getElementById('lista').innerText`)));

  // ── 5. Revoga ──
  await pausa("reativar"); // por fora: update demo_acessos set expira_em = now() + interval '2 hours'
  await d.ir(DEMO); await d.ate(`!document.getElementById('gsc-portao').hidden`);
  await d.js(preencher("#gsc-login", login)); await d.js(preencher("#gsc-senha", senha));
  await d.js(`document.getElementById('gsc-form').requestSubmit(), true`);
  confere("Demo: entra de novo depois de reativado", await d.ate(`!document.getElementById('gsc-faixa').hidden`, 30000));
  await c.js(`window.dispatchEvent(new Event('focus')), true`); await espera(2500);
  await c.foto("07-central-lista");
  await c.js(`(function(){var li=[...document.querySelectorAll('#lista .linha')].find(l=>l.textContent.includes(${JSON.stringify(login)}));[...li.querySelectorAll('button')].find(b=>b.textContent==='Revogar').click();return true})()`);
  confere("Central: revogar", await c.ate(`/Revogado/.test(document.getElementById('lista').innerText)`, 15000));
  await c.foto("08-central-revogado");
  await espera(16000);
  await d.js(`window.dispatchEvent(new Event('focus')), true`);
  confere("Demo: revogado no meio do uso → sai com aviso", await d.ate(`!document.getElementById('gsc-portao').hidden && /encerrado/.test(document.getElementById('gsc-aviso-texto').textContent)`, 20000));
  await d.js(preencher("#gsc-login", login)); await d.js(preencher("#gsc-senha", senha));
  await d.js(`document.getElementById('gsc-form').requestSubmit(), true`);
  await espera(3000);
  confere("Demo: login de acesso revogado é recusado", (await d.js(`!document.getElementById('gsc-portao').hidden && /encerrado/.test(document.getElementById('gsc-aviso-texto').textContent)`)) === true);
  await d.foto("09-demo-revogado");

  // ── 6. Senha errada ──
  await d.js(preencher("#gsc-login", "ninguem.xxxx")); await d.js(preencher("#gsc-senha", "Errada1234"));
  await d.js(`document.getElementById('gsc-form').requestSubmit(), true`);
  confere("Demo: senha errada", await d.ate(`/não conferem/.test(document.getElementById('gsc-erro').textContent)`, 10000));

  const errosJs = [...c.erros, ...d.erros].filter((e) => !/ResizeObserver/.test(e));
  confere("Sem erros de JavaScript", errosJs.length === 0, errosJs.slice(0, 3).join(" | ").slice(0, 400));
  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\n${resultados.length - falhas}/${resultados.length} conferências OK`);
  fim(falhas ? 1 : 0);
} catch (e) { console.log("ERRO", e.stack); fim(2); }

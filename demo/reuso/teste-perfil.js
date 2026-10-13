// Versão de teste — Meu perfil: simula /api/perfil (a agenda fictícia está no simulador do repositório).
// Nada aqui fala com o BI de produção.
(function () {
  "use strict";

  var perfil = { id: 1, nome: "Teste", email: "teste@exemplo.com", papel: "desenvolvedor", recebe_resumo: false, recebe_alertas: true, ultimo_acesso_em: new Date().toISOString(), foto_em: null };

  function rota(metodo, caminho) {
    // "Meu perfil" (a foto não aparece na versão de teste: a imagem viria do servidor)
    if (caminho === "/api/perfil" && metodo === "GET") return [200, perfil];
    if (caminho === "/api/perfil" && metodo === "PUT") return [200, { ok: true }];
    if (caminho === "/api/perfil/foto") return [409, { erro: "Na versão de teste a foto não é guardada." }];
    return null;
  }

  var fetchAnterior = window.fetch.bind(window);
  window.fetch = function (entrada, opcoes) {
    var url = typeof entrada === "string" ? entrada : entrada && entrada.url ? entrada.url : String(entrada);
    var u;
    try { u = new URL(url, location.href); } catch (e) { return fetchAnterior(entrada, opcoes); }
    if (typeof entrada !== "string" || url.indexOf("/api/") !== 0) return fetchAnterior(entrada, opcoes);
    var r = rota(((opcoes && opcoes.method) || "GET").toUpperCase(), u.pathname);
    if (!r) return fetchAnterior(entrada, opcoes);
    return new Promise(function (ok) {
      setTimeout(function () { ok(new Response(JSON.stringify(r[1]), { status: r[0], headers: { "Content-Type": "application/json" } })); }, 140);
    });
  };
})();

// Versão de teste — botão "Menu claro/escuro" no selo "Teste · dados fictícios": alterna o menu lateral na hora
// (o mesmo data-menu e a mesma chave bi:menu de Ajustes › Meu perfil › Aparência), para comparar as duas versões.
(function () {
  "use strict";
  var CHAVE = "bi:menu";
  function atual() { return document.documentElement.dataset.menu === "claro" ? "claro" : "escuro"; }
  function rotulo(b) { b.textContent = atual() === "claro" ? "Menu escuro" : "Menu claro"; }
  function montar() {
    var selo = document.querySelector(".aviso-teste");
    if (!selo || selo.querySelector(".aviso-botao")) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "aviso-botao";
    b.setAttribute("aria-label", "Alternar o menu entre claro e escuro");
    rotulo(b);
    b.addEventListener("click", function () {
      var v = atual() === "claro" ? "escuro" : "claro";
      try { localStorage.setItem(CHAVE, v); } catch (e) { /* só preferência visual */ }
      document.documentElement.dataset.menu = v;
      rotulo(b);
    });
    selo.appendChild(b);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
  else montar();
  // o selo vem depois deste script na página: confere de novo quando tudo carregar
  window.addEventListener("load", montar);
})();

// Briefing da implantação pelo link (sem login): uma pergunta por tela. O código vem do endereço (#c=…); cada resposta vai para a função
// central-briefing logo depois de a pessoa parar de digitar e ao passar de tela. Nada fica no navegador além do que está na tela.
(function () {
  "use strict";
  var SUPABASE = "https://kwysrvuvgdovmwhptqaw.supabase.co";
  var CHAVE_PUBLICA = "sb_publishable_xq34BKVIUMI-18n21-Cnmw_QE8vQvuF";
  var PERGUNTAS = window.BRIEFING_PERGUNTAS || [];
  var codigo = (location.hash.match(/[#&]c=([A-Za-z0-9_-]{24,64})/) || [])[1] || "";
  var respostas = {}, pendentes = {}, relogio = null, salvando = false, enviadoEm = null, clinica = "";
  var atual = -1; // -1 = abertura; 0..n-1 = perguntas; n = enviar; n+1 = recebido
  var semMovimento = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function el(tag, attrs, filhos) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "texto") e.textContent = attrs[k];
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) e.setAttribute(k, "");
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
    });
    (filhos || []).forEach(function (f) { if (f != null) e.appendChild(typeof f === "string" ? document.createTextNode(f) : f); });
    return e;
  }
  function pedir(corpo) {
    corpo.codigo = codigo;
    return fetch(SUPABASE + "/functions/v1/central-briefing", {
      method: "POST", headers: { apikey: CHAVE_PUBLICA, Authorization: "Bearer " + CHAVE_PUBLICA, "Content-Type": "application/json" }, body: JSON.stringify(corpo),
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d.status = r.status; return d; }); });
  }
  function hora(d) { return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  function dia(iso) { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); }
  var folha = document.getElementById("folha");

  // ── respostas ──
  function temValor(v) { return Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim()); }
  function visivel(c) {
    if (!c.mostrarSe) return true;
    return Object.keys(c.mostrarSe).every(function (k) {
      var v = respostas[k], quer = [].concat(c.mostrarSe[k]);
      return quer.some(function (q) { return Array.isArray(v) ? v.indexOf(q) >= 0 : v === q; });
    });
  }
  function respondida(p) { return p.campos.some(function (c) { return visivel(c) && temValor(respostas[c.id]); }); }
  function feitas() { return PERGUNTAS.filter(respondida).length; }
  var salvoEl = null;
  function marcarSalvo(texto, ok) { if (salvoEl) { salvoEl.textContent = texto; salvoEl.className = "salvo" + (ok ? " ok" : ""); } }
  function mudar(id, valor, depois) {
    respostas[id] = valor; pendentes[id] = valor;
    document.querySelectorAll("[data-mostrar-se]").forEach(function (n) { n.hidden = !visivel(JSON.parse(n.getAttribute("data-mostrar-se"))); });
    atualizarBotao();
    marcarSalvo("Salvando…");
    clearTimeout(relogio); relogio = setTimeout(salvar, depois == null ? 700 : depois);
  }
  function salvar() {
    if (salvando) { clearTimeout(relogio); relogio = setTimeout(salvar, 400); return Promise.resolve(); }
    var lote = pendentes; pendentes = {};
    if (!Object.keys(lote).length) return Promise.resolve();
    salvando = true;
    return pedir({ acao: "salvar", respostas: lote }).then(function (r) {
      salvando = false;
      if (!r.ok) throw new Error(r.erro || "erro");
      marcarSalvo("Salvo às " + hora(new Date()), true);
    }).catch(function () {
      salvando = false;
      Object.keys(lote).forEach(function (k) { if (!(k in pendentes)) pendentes[k] = lote[k]; });
      marcarSalvo("Sem conexão. Tento de novo em instantes.");
      clearTimeout(relogio); relogio = setTimeout(salvar, 5000);
    });
  }
  window.addEventListener("beforeunload", function (ev) { if (Object.keys(pendentes).length) { ev.preventDefault(); ev.returnValue = ""; } });

  // ── máscaras (só formatam o que a pessoa digita) ──
  function digitos(v, max) { return String(v || "").replace(/\D/g, "").slice(0, max); }
  var MASCARA = {
    telefone: function (v) { var d = digitos(v, 11); if (d.length <= 2) return d; if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
      return "(" + d.slice(0, 2) + ") " + (d.length === 11 ? d.slice(2, 7) + "-" + d.slice(7) : d.slice(2, 6) + "-" + d.slice(6)); },
    data: function (v) { var d = digitos(v, 8); return d.length <= 2 ? d : d.length <= 4 ? d.slice(0, 2) + "/" + d.slice(2) : d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4); },
    cep: function (v) { var d = digitos(v, 8); return d.length <= 5 ? d : d.slice(0, 5) + "-" + d.slice(5); },
    documento: function (v) { var d = digitos(v, 14);
      if (d.length <= 11) return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
      return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2"); },
  };
  var TECLADO = { email: "email", telefone: "tel", data: "numeric", cep: "numeric", documento: "numeric" };
  var AUTO = { resp_nome: "name", resp_email: "email", resp_celular: "tel", cli_cep: "postal-code", cli_endereco: "street-address", cli_email_nota: "email" };
  // CEP preenche o endereço e a cidade, se estiverem vazios (ViaCEP recebe só o CEP)
  function buscarCep(cep) {
    var d = digitos(cep, 8); if (d.length !== 8) return;
    fetch("https://viacep.com.br/ws/" + d + "/json/").then(function (r) { return r.json(); }).then(function (e) {
      if (!e || e.erro) return;
      var end = document.getElementById("c-cli_endereco"), cid = document.getElementById("c-cli_cidade");
      if (end && !end.value.trim() && e.logradouro) { end.value = e.logradouro + ", "; mudar("cli_endereco", end.value); }
      if (cid && !cid.value.trim() && e.localidade) { cid.value = [e.bairro, e.localidade + " - " + e.uf].filter(Boolean).join(", "); mudar("cli_cidade", cid.value); }
    }).catch(function () { /* sem o preenchimento, a pessoa digita */ });
  }

  // ── telas ──
  var botaoPrincipal = null;
  function atualizarBotao() {
    if (!botaoPrincipal || atual < 0 || atual >= PERGUNTAS.length) return;
    botaoPrincipal.textContent = respondida(PERGUNTAS[atual]) ? "Continuar" : "Pular por agora";
  }
  function campo(c) {
    var id = "c-" + c.id, caixa;
    if (c.tipo === "uma" || c.tipo === "varias") {
      var valor = respostas[c.id];
      if (c.tipo === "varias" && typeof valor === "string") valor = valor ? [valor] : []; // resposta antiga, de escolha única
      caixa = el("div", { class: "campo", role: c.tipo === "uma" ? "radiogroup" : "group", "aria-label": c.rotulo }, [
        el("div", { class: "opcoes" }, c.opcoes.map(function (o, i) {
          var marcado = c.tipo === "uma" ? valor === o : Array.isArray(valor) && valor.indexOf(o) >= 0;
          var inp = el("input", { type: c.tipo === "uma" ? "radio" : "checkbox", name: id, value: o, id: id + "-" + i, checked: marcado, onchange: function () {
            if (c.tipo === "uma") mudar(c.id, o, 0);
            else mudar(c.id, Array.prototype.slice.call(document.querySelectorAll('input[name="' + id + '"]:checked')).map(function (x) { return x.value; }), 0);
          } });
          return el("label", { class: "opcao" + (c.tipo === "varias" ? " varias" : ""), for: id + "-" + i }, [inp, el("span", { class: "marca", "aria-hidden": "true" }), el("span", { texto: o })]);
        })),
      ]);
      if (c.rotulo && PERGUNTAS[atual].campos.length > 1) caixa.insertBefore(el("span", { class: "rot", texto: c.rotulo }), caixa.firstChild);
    } else {
      var area = c.tipo === "texto";
      var entrada = el(area ? "textarea" : "input", area ? { id: id, class: "entrada", rows: "4" } : {
        id: id, class: "entrada", type: c.tipo === "email" ? "email" : c.tipo === "telefone" ? "tel" : "text",
        inputmode: TECLADO[c.tipo] || null, autocomplete: AUTO[c.id] || "off", placeholder: c.tipo === "data" ? "dd/mm/aaaa" : c.tipo === "cep" ? "00000-000" : null,
        autocapitalize: c.tipo === "email" ? "none" : null, spellcheck: c.tipo === "email" ? "false" : null,
      });
      entrada.value = typeof respostas[c.id] === "string" ? respostas[c.id] : "";
      entrada.addEventListener("input", function () {
        if (MASCARA[c.tipo]) entrada.value = MASCARA[c.tipo](entrada.value);
        mudar(c.id, entrada.value);
        if (c.tipo === "cep") buscarCep(entrada.value);
      });
      entrada.addEventListener("blur", function () { clearTimeout(relogio); salvar(); });
      caixa = el("label", { class: "campo", for: id }, [el("span", { class: "rot", texto: c.rotulo }), c.ajuda ? el("span", { class: "ajuda", texto: c.ajuda }) : null, entrada]);
    }
    if (c.ajuda && (c.tipo === "uma" || c.tipo === "varias")) caixa.appendChild(el("span", { class: "ajuda", texto: c.ajuda }));
    if (c.mostrarSe) { caixa.setAttribute("data-mostrar-se", JSON.stringify(c)); caixa.hidden = !visivel(c); }
    return caixa;
  }
  function topo(escura) {
    var n = PERGUNTAS.length, passo = atual >= 0 && atual < n ? (atual + 1) + " de " + n : "";
    var pct = atual < 0 ? 0 : atual >= n ? 100 : Math.round((atual / n) * 100);
    var t = el("div", {}, [
      el("div", { class: "topo" }, [el("img", { src: escura ? "./logo-gsc-branco.png" : "./logo-gsc.png", alt: "Gestão Sem Caos" }), passo ? el("span", { class: "passo", texto: passo }) : null]),
      escura ? null : el("div", { class: "trilho", "aria-hidden": "true" }, [el("i", {})]),
    ]);
    if (!escura) requestAnimationFrame(function () { var i = t.querySelector(".trilho i"); if (i) i.style.width = pct + "%"; });
    return t;
  }
  function montar(escura, conteudo, rodape) {
    folha.className = "folha" + (escura ? " escura" : "");
    folha.innerHTML = "";
    var tela = el("section", { class: "tela" + (semMovimento ? "" : " entra"), "aria-live": "polite" }, conteudo);
    folha.appendChild(topo(escura));
    folha.appendChild(tela);
    folha.appendChild(el("div", { class: "rodape" }, rodape));
    var foco = tela.querySelector("input.entrada, textarea, input[type=radio], input[type=checkbox]");
    var h = tela.querySelector("h1"); if (h) h.setAttribute("tabindex", "-1");
    setTimeout(function () { if (foco && window.innerWidth > 640 && foco.classList.contains("entrada")) foco.focus(); else if (h) h.focus({ preventScroll: true }); }, semMovimento ? 0 : 60);
    window.scrollTo(0, 0);
  }
  function irPara(i) {
    clearTimeout(relogio); salvar();
    atual = i;
    if (atual < 0) return abertura();
    if (atual >= PERGUNTAS.length + 1) return recebido();
    if (atual === PERGUNTAS.length) return revisar();
    var p = PERGUNTAS[atual];
    salvoEl = el("span", { class: "salvo", "aria-live": "polite" });
    botaoPrincipal = el("button", { type: "button", class: "btn principal", onclick: function () { irPara(atual + 1); } });
    montar(false, [
      el("span", { class: "eyebrow", texto: "Pergunta " + (atual + 1) }),
      el("h1", { texto: p.titulo }),
      p.porque ? el("p", { class: "sub", texto: p.porque }) : null,
      el("div", { class: "campos" }, p.campos.map(campo)),
    ], [
      el("button", { type: "button", class: "btn ghost", texto: "Voltar", onclick: function () { irPara(atual - 1); } }),
      salvoEl, el("span", { class: "dica" }, ["Enter ", el("kbd", { texto: "↵" })]), botaoPrincipal,
    ]);
    atualizarBotao();
  }
  function primeiraSemResposta() { for (var i = 0; i < PERGUNTAS.length; i++) if (!respondida(PERGUNTAS[i])) return i; return PERGUNTAS.length; }
  function abertura() {
    var comeco = feitas() > 0;
    montar(true, [
      el("span", { class: "eyebrow", texto: "Implantação do BI · " + clinica }),
      el("h1", { texto: "Olá! Vamos preparar o seu BI." }),
      el("p", { class: "sub", texto: "São perguntas rápidas, uma de cada vez. O que o sistema da clínica já tem (procedimentos, valores, agendas) a gente lê sozinho. Não sabe alguma? Pode pular, a gente conversa na reunião." }),
      el("div", { class: "meta" }, [
        el("div", {}, [el("span", { texto: "Perguntas" }), el("b", { texto: String(PERGUNTAS.length) })]),
        el("div", {}, [el("span", { texto: "Tempo" }), el("b", { texto: "uns 10 minutos" })]),
        el("div", {}, [el("span", { texto: "Respostas" }), el("b", { texto: "salvas sozinhas" })]),
      ]),
      enviadoEm ? el("p", { class: "sub", texto: "Você já enviou em " + dia(enviadoEm) + ". Pode corrigir à vontade: a gente sempre vê a versão mais nova." }) : null,
    ], [
      el("button", { type: "button", class: "btn laranja principal", texto: comeco ? "Continuar de onde parei" : "Começar", onclick: function () { irPara(comeco ? Math.min(primeiraSemResposta(), PERGUNTAS.length) : 0); } }),
    ]);
  }
  function revisar() {
    var n = feitas(), total = PERGUNTAS.length, faltam = PERGUNTAS.map(function (p, i) { return respondida(p) ? null : i; }).filter(function (x) { return x !== null; });
    salvoEl = el("span", { class: "salvo" });
    var enviar = el("button", { type: "button", class: "btn laranja principal", texto: enviadoEm ? "Enviar de novo" : "Enviar respostas", onclick: function () {
      enviar.disabled = true; enviar.textContent = "Enviando…";
      salvar().then(function () {
        if (Object.keys(pendentes).length) throw new Error("pendente");
        return pedir({ acao: "enviar" });
      }).then(function (r) {
        if (!r.ok) throw new Error(r.erro || "erro");
        enviadoEm = new Date().toISOString(); irPara(total + 1);
      }).catch(function () { enviar.disabled = false; enviar.textContent = enviadoEm ? "Enviar de novo" : "Enviar respostas"; marcarSalvo("Não deu para enviar agora. Tente de novo."); });
    } });
    montar(false, [
      el("span", { class: "eyebrow", texto: "Tudo certo?" }),
      el("h1", { texto: n === total ? "Você respondeu todas as perguntas." : "Você respondeu " + n + " de " + total + "." }),
      el("p", { class: "sub", texto: n === total ? "Se quiser, volte e confira. Quando estiver bom, é só enviar." : "Pode enviar assim e completar na reunião, ou voltar às que ficaram em branco." }),
      faltam.length ? el("div", { class: "opcoes" }, faltam.slice(0, 6).map(function (i) {
        return el("button", { type: "button", class: "opcao", onclick: function () { irPara(i); } }, [el("span", { class: "marca", "aria-hidden": "true" }), el("span", { texto: PERGUNTAS[i].titulo })]);
      })) : null,
    ], [
      el("button", { type: "button", class: "btn ghost", texto: "Voltar", onclick: function () { irPara(total - 1); } }), salvoEl, enviar,
    ]);
  }
  function recebido() {
    montar(false, [
      el("div", { class: "ok-grande", "aria-hidden": "true" }),
      el("h1", { texto: "Recebemos as suas respostas. Obrigado!" }),
      el("p", { class: "sub", texto: "A Gestão Sem Caos já pode preparar a implantação. Se lembrar de algo, é só abrir este mesmo link e corrigir." }),
    ], [el("button", { type: "button", class: "btn ghost", texto: "Rever as respostas", onclick: function () { irPara(0); } })]);
  }
  function erro(titulo, texto) {
    montar(false, [el("h1", { texto: titulo }), el("p", { class: "sub", texto: texto })], []);
  }
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter" || atual < 0 || atual >= PERGUNTAS.length || !botaoPrincipal) return;
    var t = ev.target;
    if (t && t.tagName === "TEXTAREA" && !(ev.metaKey || ev.ctrlKey)) return;
    if (t && t.tagName === "BUTTON") return;
    ev.preventDefault(); botaoPrincipal.click();
  });

  if (!codigo) { erro("Link incompleto", "Abra o link inteiro que a Gestão Sem Caos mandou."); return; }
  pedir({ acao: "ler" }).then(function (r) {
    if (!r.ok) { erro("Este link não abre", r.erro || "Peça um novo à Gestão Sem Caos."); return; }
    respostas = r.respostas || {}; enviadoEm = r.enviado_em || null; clinica = r.clinica;
    document.title = "Briefing · " + r.clinica;
    abertura();
  }).catch(function () { erro("Sem conexão", "Não consegui abrir o briefing agora. Confira a internet e recarregue a página."); });
})();

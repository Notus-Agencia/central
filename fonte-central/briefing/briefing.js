// Briefing da implantação pelo link (sem login). O código vem do endereço (#c=…); cada resposta vai para a função central-briefing
// logo depois de a pessoa parar de digitar. Nada fica no navegador além do que está na tela.
(function () {
  "use strict";
  var SUPABASE = "https://kwysrvuvgdovmwhptqaw.supabase.co";
  var CHAVE_PUBLICA = "sb_publishable_xq34BKVIUMI-18n21-Cnmw_QE8vQvuF";
  var PERGUNTAS = window.BRIEFING_PERGUNTAS || [];
  var codigo = (location.hash.match(/[#&]c=([A-Za-z0-9_-]{24,64})/) || [])[1] || "";
  var respostas = {}, pendentes = {}, relogio = null, salvando = false, enviadoEm = null;

  function $(id) { return document.getElementById(id); }
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
  function estado(titulo, texto) {
    var raiz = $("raiz"); raiz.querySelectorAll(".estado, .conteudo").forEach(function (n) { n.remove(); });
    raiz.appendChild(el("div", { class: "estado", role: "status" }, [el("h1", { texto: titulo }), el("p", { texto: texto })]));
  }
  function hora(d) { return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  function dia(iso) { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); }

  // ── respostas ──
  function temValor(v) { return Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim()); }
  function visivel(campo) {
    if (!campo.mostrarSe) return true;
    return Object.keys(campo.mostrarSe).every(function (k) { return respostas[k] === campo.mostrarSe[k]; });
  }
  function respondida(p) { return p.campos.some(function (c) { return visivel(c) && temValor(respostas[c.id]); }); }
  function atualizarProgresso() {
    var n = PERGUNTAS.filter(respondida).length;
    $("barra").style.width = Math.round((n / PERGUNTAS.length) * 100) + "%";
    PERGUNTAS.forEach(function (p) { var c = document.querySelector('[data-pergunta="' + p.id + '"]'); if (c) c.classList.toggle("feito", respondida(p)); });
    return n;
  }
  function aviso(texto) { $("contagem").textContent = atualizarProgresso() + " de " + PERGUNTAS.length + " respondidas" + (texto ? " · " + texto : ""); }
  function mudar(id, valor) {
    respostas[id] = valor; pendentes[id] = valor;
    document.querySelectorAll("[data-mostrar-se]").forEach(function (n) { n.hidden = !visivel(JSON.parse(n.getAttribute("data-mostrar-se"))); });
    aviso("salvando…");
    clearTimeout(relogio); relogio = setTimeout(salvar, 800);
  }
  function salvar() {
    if (salvando) { clearTimeout(relogio); relogio = setTimeout(salvar, 500); return Promise.resolve(); }
    var lote = pendentes; pendentes = {};
    if (!Object.keys(lote).length) return Promise.resolve();
    salvando = true;
    return pedir({ acao: "salvar", respostas: lote }).then(function (r) {
      salvando = false;
      if (!r.ok) throw new Error(r.erro || "erro");
      aviso("salvo às " + hora(new Date()));
    }).catch(function () {
      salvando = false;
      Object.keys(lote).forEach(function (k) { if (!(k in pendentes)) pendentes[k] = lote[k]; });
      aviso("sem conexão, tento de novo");
      clearTimeout(relogio); relogio = setTimeout(salvar, 5000);
    });
  }
  window.addEventListener("beforeunload", function (ev) { if (Object.keys(pendentes).length) { ev.preventDefault(); ev.returnValue = ""; } });

  // ── tela ──
  function campo(c) {
    var id = "c-" + c.id, filhos = [el("span", { texto: c.rotulo }), c.ajuda ? el("small", { class: "ajuda", texto: c.ajuda }) : null];
    var caixa;
    if (c.tipo === "uma" || c.tipo === "varias") {
      var atual = respostas[c.id];
      caixa = el("div", { class: "campo", role: c.tipo === "uma" ? "radiogroup" : "group", "aria-label": c.rotulo }, [el("span", { texto: c.rotulo }),
        c.ajuda ? el("small", { class: "ajuda", texto: c.ajuda }) : null,
        el("div", { class: "opcoes" }, c.opcoes.map(function (o, i) {
          var marcado = c.tipo === "uma" ? atual === o : Array.isArray(atual) && atual.indexOf(o) >= 0;
          var inp = el("input", { type: c.tipo === "uma" ? "radio" : "checkbox", name: id, value: o, id: id + "-" + i, checked: marcado, onchange: function () {
            if (c.tipo === "uma") mudar(c.id, o);
            else mudar(c.id, Array.prototype.slice.call(document.querySelectorAll('input[name="' + id + '"]:checked')).map(function (x) { return x.value; }));
          } });
          return el("label", { class: "opcao", for: id + "-" + i }, [inp, o]);
        }))]);
    } else {
      var entrada = el(c.tipo === "texto" ? "textarea" : "input", c.tipo === "texto" ? { id: id, rows: "3" } : { id: id, type: "text", autocomplete: "off" });
      entrada.value = typeof respostas[c.id] === "string" ? respostas[c.id] : "";
      entrada.addEventListener("input", function () { mudar(c.id, entrada.value); });
      entrada.addEventListener("blur", function () { clearTimeout(relogio); salvar(); });
      caixa = el("label", { class: "campo", for: id }, filhos.concat([entrada]));
    }
    if (c.mostrarSe) { caixa.setAttribute("data-mostrar-se", JSON.stringify(c)); caixa.hidden = !visivel(c); }
    return caixa;
  }
  function desenhar(clinica) {
    var raiz = $("raiz"); raiz.querySelectorAll(".estado").forEach(function (n) { n.remove(); });
    var conteudo = el("div", { class: "conteudo" }, [
      el("h1", { texto: "Briefing · " + clinica }),
      el("p", { class: "lead", texto: "São " + PERGUNTAS.length + " perguntas, uns 15 minutos. Tudo é salvo enquanto você responde: dá para parar e continuar depois por este mesmo link. Não sabe alguma? Deixe em branco, a gente conversa na reunião." }),
      el("div", { id: "recebido" }),
    ].concat(PERGUNTAS.map(function (p, i) {
      return el("section", { class: "cartao", "data-pergunta": p.id, "aria-labelledby": "t-" + p.id }, [
        el("span", { class: "num", "aria-hidden": "true", texto: String(i + 1) }),
        el("h2", { id: "t-" + p.id, texto: p.titulo }),
        el("p", { class: "porque", texto: p.porque }),
      ].concat(p.campos.map(campo)));
    })));
    raiz.appendChild(conteudo);
    $("rodape").hidden = false;
    mostrarEnviado();
    aviso("");
  }
  function mostrarEnviado() {
    var caixa = $("recebido"); if (!caixa) return; caixa.innerHTML = "";
    if (!enviadoEm) return;
    caixa.appendChild(el("section", { class: "cartao pronto", role: "status" }, [
      el("h2", { texto: "Recebemos as suas respostas" }),
      el("p", { class: "porque", texto: "Enviado em " + dia(enviadoEm) + ". Se lembrar de algo, é só corrigir aqui: a gente sempre vê a versão mais nova." }),
    ]));
    $("enviar").textContent = "Enviar de novo";
  }
  $("enviar").addEventListener("click", function () {
    var b = this; b.disabled = true; b.textContent = "Enviando…";
    clearTimeout(relogio);
    salvar().then(function () {
      if (Object.keys(pendentes).length) throw new Error("pendente");
      return pedir({ acao: "enviar" });
    }).then(function (r) {
      if (!r.ok) throw new Error(r.erro || "erro");
      enviadoEm = new Date().toISOString(); mostrarEnviado();
      window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }).catch(function () { aviso("não deu para enviar agora, tente de novo"); b.textContent = enviadoEm ? "Enviar de novo" : "Enviar respostas"; })
      .then(function () { b.disabled = false; });
  });

  if (!codigo) { estado("Link incompleto", "Abra o link inteiro que a Gestão Sem Caos mandou."); return; }
  pedir({ acao: "ler" }).then(function (r) {
    if (!r.ok) { estado("Este link não abre", r.erro || "Peça um novo à Gestão Sem Caos."); return; }
    respostas = r.respostas || {}; enviadoEm = r.enviado_em || null;
    document.title = "Briefing · " + r.clinica;
    desenhar(r.clinica);
  }).catch(function () { estado("Sem conexão", "Não consegui abrir o briefing agora. Confira a internet e recarregue a página."); });
})();

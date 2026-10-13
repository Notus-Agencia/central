#!/bin/bash
# Monta o site da demonstração (repositório bi-demo) a partir do build de teste.
# uso: montar-demo.sh <codigo-do-repo> <saida>
#   1) roda a montagem da versão de teste (montar-teste.sh) sobre o código (tarball do develop, com pnpm install);
#   2) troca nomes reais que o app cita de propósito (o build da clínica) pelos fictícios;
#   3) gera a página com o portão de login (fonte-demo/) e confere com checar-nomes-reais --demo.
set -e
C="$1"; OUT="$2"; AQUI=$(cd "$(dirname "$0")" && pwd)
BASE="${TMPDIR:-/tmp}/gsc-demo-montado"
TROCAS="${GSC_TROCAS:-$AQUI/trocas.local.json}"
[ -s "$TROCAS" ] || { echo "falta $TROCAS (pares [real, fictício]; veja demo/trocas.exemplo.json)" >&2; exit 1; }
bash "$AQUI/montar-teste.sh" "$C" "$BASE" >/dev/null
rm -rf "$OUT"; mkdir -p "$OUT"
cp -R "$BASE.dist/assets" "$OUT/"
cp "$BASE.dist/icone-180.png" "$OUT/"
cp "$BASE.dados.js" "$OUT/teste-dados.js"
cp "$AQUI/reuso/teste-metas.js" "$AQUI/reuso/teste-perfil.js" "$AQUI/reuso/teste-modulos.js" "$AQUI/reuso/icone.svg" "$OUT/"
cp "$AQUI/fonte-demo/portao.js" "$OUT/"
printf 'demo.gestaosemcaos.com.br\n' > "$OUT/CNAME"
: > "$OUT/.nojekyll"
mkdir -p "$OUT/.github/workflows"; cp "$AQUI/../comum/pages-demo.yml" "$OUT/.github/workflows/pages.yml"
printf 'User-agent: *\nDisallow: /\n' > "$OUT/robots.txt"
python3 - "$BASE.dist/index.html" "$AQUI/fonte-demo/index.modelo.html" "$OUT" "$TROCAS" <<'PY'
import json, os, re, sys
dist, modelo, out = sys.argv[1], sys.argv[2], sys.argv[3]
d = open(dist, encoding="utf-8").read()
css = re.search(r'<link rel="stylesheet"[^>]*href="([^"]+)"', d).group(1)
mod = re.search(r'<script type="module"[^>]*src="([^"]+)"', d).group(1)
fonte = [f for f in os.listdir(os.path.join(out, "assets")) if re.match(r"plus-jakarta-sans-latin-wght-normal-.*\.woff2$", f)][0]
app = {"css": css, "modulo": mod, "scripts": ["./teste-dados.js", "./teste-metas.js", "./teste-perfil.js", "./teste-modulos.js"]}
m = open(modelo, encoding="utf-8").read().replace("{{FONTE_LATIN}}", fonte).replace("{{APP_JSON}}", json.dumps(app))
open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(m)

# o app cita a clínica real de propósito (é o build dela); na demonstração vira a Clínica Orvalho e as Dras. fictícias.
# Os pares [real, fictício] ficam em demo/trocas.local.json, fora do git (modelo: demo/trocas.exemplo.json).
trocas = [tuple(t) for t in json.load(open(sys.argv[4], encoding="utf-8"))]
pasta = os.path.join(out, "assets")
total = 0
for f in os.listdir(pasta):
    if not f.endswith(".js"): continue
    p = os.path.join(pasta, f); s = open(p, encoding="utf-8").read(); s0 = s
    for a, b in trocas:
        total += s.count(a); s = s.replace(a, b)
    if s != s0: open(p, "w", encoding="utf-8").write(s)
print("trocas de nome:", total)
PY
cd "$C" && node scripts/checar-nomes-reais.mjs --demo "$OUT"
echo "demo montada em $OUT"

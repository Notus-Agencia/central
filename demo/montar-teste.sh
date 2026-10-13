#!/bin/bash
# uso: montar-teste.sh <codigo> <saida>   (monta a versão de teste do BI com o simulador; restaura o main.tsx no fim)
set -e
C="$1"; OUT="$2"; T=$(cd "$(dirname "$0")" && pwd)
cd "$C/frontend"
cp src/main.tsx /tmp/main.tsx.orig.$$
python3 - <<'PY'
p="src/main.tsx"; s=open(p,encoding="utf-8").read()
s=s.replace('import { BrowserRouter,', 'import { MemoryRouter,',1)
s=s.replace('<BrowserRouter>','<MemoryRouter initialEntries={[new URLSearchParams(location.search).has("quadro") ? "/estilo?quadro=1" : ((window as any).__inicioDemo ?? "/inicio")]}>',1)
s=s.replace('</BrowserRouter>','</MemoryRouter>',1)
s+='\nimport * as __bonusMod from "./lib/bonus";\n(window as any).__bonus = __bonusMod;\n'
s+='import * as __modulosMod from "./lib/modulos";\n(window as any).__modulos = __modulosMod;\n'
s+='import { perfisDe as __perfisDe } from "./lib/perfis";\n(window as any).__perfisDe = __perfisDe;\n'
open(p,"w",encoding="utf-8").write(s)
PY
npx vite build --base ./ --outDir "$OUT.dist" --emptyOutDir > "$OUT.vite.log" 2>&1 || { cp /tmp/main.tsx.orig.$$ src/main.tsx; echo VITE FALHOU; tail "$OUT.vite.log"; exit 1; }
cp /tmp/main.tsx.orig.$$ src/main.tsx; rm /tmp/main.tsx.orig.$$
echo 'import { instalarNoFetch } from "./src/vitrine/simulador.js"; instalarNoFetch();' > entrada-teste.js
ES=$(ls -d "$C"/node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild | head -1)
"$ES" entrada-teste.js --bundle --format=iife --charset=utf8 --outfile="$OUT.dados.js" --minify-whitespace --log-level=warning
rm entrada-teste.js
rm -rf "$OUT"; mkdir -p "$OUT"
cp -R "$OUT.dist/assets" "$OUT/"; for f in icone-180.png icone-email.png; do [ -f "$OUT.dist/$f" ] && cp "$OUT.dist/$f" "$OUT/"; done
cp "$OUT.dados.js" "$OUT/teste-dados.js"
cp "$T/reuso/teste-metas.js" "$T/reuso/teste-perfil.js" "$T/reuso/icone.svg" "$T/reuso/teste-modulos.js" "$OUT/"
python3 "$T/pagina.py" "$OUT.dist/index.html" "$T/reuso/modelo-index.html" \
  | sed 's#<script src="./teste-perfil.js" charset="utf-8"></script>#<script src="./teste-perfil.js" charset="utf-8"></script>\n<script src="./teste-modulos.js" charset="utf-8"></script>#' > "$OUT/index.html"
grep -q teste-modulos.js "$OUT/index.html"
echo montado em $OUT

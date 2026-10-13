#!/bin/bash
# Monta a Central em site/ (é o que o GitHub Pages publica). uso: ./montar-central.sh
set -e
AQUI=$(cd "$(dirname "$0")" && pwd); OUT="$AQUI/site"
rm -rf "$OUT"; mkdir -p "$OUT"
cp "$AQUI/fonte-central/central.js" "$AQUI/comum/fonte.woff2" "$AQUI/comum/icone.svg" "$AQUI/comum/icone-email.png" "$OUT/"
printf 'central.gestaosemcaos.com.br\n' > "$OUT/CNAME"; : > "$OUT/.nojekyll"; printf 'User-agent: *\nDisallow: /\n' > "$OUT/robots.txt"
python3 - "$AQUI/fonte-central/index.modelo.html" "$AQUI/comum/logo-limpo.svg" "$OUT/index.html" <<'PY'
import json, sys
m = open(sys.argv[1], encoding="utf-8").read(); logo = open(sys.argv[2], encoding="utf-8").read()
open(sys.argv[3], "w", encoding="utf-8").write(m.replace("{{LOGO_JSON}}", json.dumps(logo)))
PY
node --check "$OUT/central.js"
echo "central montada em $OUT"

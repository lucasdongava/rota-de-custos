#!/bin/sh
# Copia docs/ para a pasta do lucasgava.com e aponta os precos para o repositorio (atualizados todo dia pelo coletor)
set -e
cd "$(dirname "$0")"
# nova versao dos arquivos (o servidor guarda cache por 4 horas)
V=$(date +%Y%m%d%H%M)
sed -i -E "s#(css/style\.css|js/(geo|data|i18n|app)\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#g" docs/index.html
cd "$(dirname "$0")/../lucasgava-site"
cp -r ../rota-de-custos/docs/. rota-de-custos/
python - <<'PY'
import re
p='rota-de-custos/js/data.js'
s=open(p,encoding='utf8').read()
s=re.sub(r"pricesUrl:\s*'[^']*'","pricesUrl:'https://raw.githubusercontent.com/lucasdongava/rota-de-custos/main/docs/data/prices.json'",s)
s=re.sub(r"flightsDir:\s*'[^']*'","flightsDir:'https://raw.githubusercontent.com/lucasdongava/rota-de-custos/main/docs/data/flights/'",s)
open(p,'w',encoding='utf8',newline='').write(s)
PY

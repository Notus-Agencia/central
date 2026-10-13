#!/bin/bash
# teste da API (admin de teste); uso: api.sh
D=$(dirname "$0"); U=https://kwysrvuvgdovmwhptqaw.supabase.co; K=sb_publishable_xq34BKVIUMI-18n21-Cnmw_QE8vQvuF
j() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$1"; }
TOK=$(curl -s -X POST "$U/auth/v1/token?grant_type=password" -H "apikey: $K" -H "Content-Type: application/json" -d "{\"email\":\"admin-teste-e2e@central.gestaosemcaos.com.br\",\"password\":\"$(cat $D/.senha-admin-teste)\"}" | j "d['access_token']")
R=$(curl -s -X POST $U/functions/v1/central-criar-acesso -H "apikey: $K" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d '{"nome":"Teste Curl Ângelo","horas":2}')
L=$(echo "$R" | j "d['login']"); S=$(echo "$R" | j "d['senha']"); ID=$(echo "$R" | j "d['acesso']['id']")
echo "criado: login=$L senha_len=${#S} id=$ID"
UT=$(curl -s -X POST "$U/auth/v1/token?grant_type=password" -H "apikey: $K" -H "Content-Type: application/json" -d "{\"email\":\"$L@demo.gestaosemcaos.com.br\",\"password\":\"$S\"}" | j "d['access_token']")
echo "valida(novo):" $(curl -s -X POST $U/rest/v1/rpc/demo_sessao_valida -H "apikey: $K" -H "Authorization: Bearer $UT" -H "Content-Type: application/json" -d '{"p_novo_login":true}')
echo "rls demo vê linhas:" $(curl -s "$U/rest/v1/demo_acessos?select=login" -H "apikey: $K" -H "Authorization: Bearer $UT")
echo "demo tenta escrever:" $(curl -s -X PATCH "$U/rest/v1/demo_acessos?id=eq.$ID" -H "apikey: $K" -H "Authorization: Bearer $UT" -H "Content-Type: application/json" -d '{"expira_em":"2030-01-01T00:00:00Z"}')
echo "demo tenta criar acesso:" $(curl -s -X POST $U/functions/v1/central-criar-acesso -H "apikey: $K" -H "Authorization: Bearer $UT" -H "Content-Type: application/json" -d '{"nome":"Hacker","horas":2}')
echo "anon chama rpc:" $(curl -s -X POST $U/rest/v1/rpc/demo_sessao_valida -H "apikey: $K" -H "Content-Type: application/json" -d '{}')
echo "anon lê tabela:" $(curl -s "$U/rest/v1/demo_acessos?select=login" -H "apikey: $K")
echo "admin lista:" $(curl -s "$U/rest/v1/demo_acessos?select=login,acessos,revogado" -H "apikey: $K" -H "Authorization: Bearer $TOK")
echo "estender +24h:" $(curl -s -X POST $U/functions/v1/central-estender -H "apikey: $K" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d "{\"id\":\"$ID\",\"horas\":24}" | j "d['acesso']['expira_em']")
echo "revogar:" $(curl -s -X POST $U/functions/v1/central-revogar -H "apikey: $K" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d "{\"id\":\"$ID\"}" | j "d['acesso']['revogado']")
echo "valida após revogar:" $(curl -s -X POST $U/rest/v1/rpc/demo_sessao_valida -H "apikey: $K" -H "Authorization: Bearer $UT" -H "Content-Type: application/json" -d '{}')
echo "login após revogar:" $(curl -s -X POST "$U/auth/v1/token?grant_type=password" -H "apikey: $K" -H "Content-Type: application/json" -d "{\"email\":\"$L@demo.gestaosemcaos.com.br\",\"password\":\"$S\"}" | j "d.get('error_code') or d.get('msg') or 'ENTROU'")
echo "estender revogado:" $(curl -s -X POST $U/functions/v1/central-estender -H "apikey: $K" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d "{\"id\":\"$ID\",\"horas\":24}")

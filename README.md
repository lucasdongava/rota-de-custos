# Rota de Custos

Guia de viagens que mostra onde e quando vale mais a pena viajar (Brasil, EUA, Canadá, México, China e Japão), com custo por estado, melhor época do ano e as melhores companhias aéreas **saindo da cidade de quem está usando**. Uma pessoa em São Paulo vê voos, tempos e preços a partir de Guarulhos; quem está em Vitória vê a partir de VIX.

Os preços se atualizam sozinhos todo dia. Depois de configurado, não é preciso mexer em nada.

## Estrutura

```
docs/                      ← é isto que vai para o ar (site estático)
  index.html
  css/style.css
  js/app.js                lógica do site
  js/data.js               dados base: estados, custos, companhias, aeroportos, feriados (calculados p/ qualquer ano)
  js/i18n.js               textos em português, espanhol, inglês, chinês e francês + nomes de lugares
  js/geo.js                contornos dos estados (Natural Earth, domínio público)
  data/prices.json         câmbio do dia e hotéis reais — gerado todo dia pelo coletor
  data/flights/XXX.json    voos reais por aeroporto de saída (GRU.json, VIX.json…) — gerado todo dia
collector/collect.mjs      coletor diário (Node 18+, sem dependências)
.github/workflows/atualizar-precos.yml   agenda o coletor todo dia às 05:17
```

## Como funciona a atualização

1. Todo dia às 05:17 (Brasília), o GitHub Actions roda `collector/collect.mjs`.
2. O coletor busca:
   - **Voos:** menor tarifa de ida e volta por companhia, de cada aeroporto de saída (padrão: GRU, GIG, BSB, CNF, VIX, SSA, REC, FOR, POA, CWB) para cada destino, mês a mês nos próximos 6 meses. Fonte: Aviasales Data API (Travelpayouts), com preços de buscas reais das últimas 48 h. São cerca de 9 mil buscas por dia, que levam uns 40 minutos.
   - **Hotéis (opcional):** diária mediana de hotéis 3 e 4 estrelas por estado, via Google Hotels (SerpApi). Faz 25 buscas por dia em rodízio, então cada estado é renovado mais ou menos a cada 3 semanas.
   - **Câmbio:** US$, C$, MX$ e ¥ em reais (AwesomeAPI, gratuita).
3. Ele grava os arquivos em `docs/data/` e faz commit. A hospedagem republica sozinha.
4. O site lê esse arquivo. Onde há preço real, mostra o selo **preço real**; onde não há, usa a estimativa do modelo. Ele nunca quebra.

Se uma busca falhar, o último preço bom é mantido por até 7 dias. Se quase todas as buscas de voo falharem, a execução fica vermelha e o GitHub manda um e-mail.

## Idiomas e tema
- Português, espanhol, inglês, chinês e francês. O site abre no idioma do navegador da pessoa; o **triângulo** no canto superior direito troca o idioma.
- O **círculo** alterna entre modo claro e escuro. As duas escolhas ficam salvas no navegador da pessoa.
- Para ajustar um texto, edite `docs/js/i18n.js` (bloco `ui`). Os nomes de estados e cidades vêm do Natural Earth.

## Localização de quem usa (automática e invisível)
- Ao abrir o site, a cidade de saída é descoberta sozinha pela localização aproximada do IP (serviço gratuito get.geojs.io). Não há pergunta, permissão nem filtro na tela: a pessoa só vê o resultado, como "Voos · São Paulo → Orlando".
- O site escolhe o aeroporto de capital mais perto dessa localização.
- Se não for possível localizar (bloqueador, falha do serviço), o site usa a saída padrão (`CONFIG.origin`, hoje GRU).
- Pelo celular (4G/5G), algumas operadoras mostram o IP em outra cidade. Nesses casos a cidade detectada pode não ser a da pessoa.
- Capitais fora da lista de coleta funcionam com voos estimados. Para ter preço real de mais cidades, acrescente o código na variável `ORIGINS`.
- Para desativar, deixe `ipGeoUrl: ''` em `CONFIG` (`docs/js/data.js`).

## Passo a passo para publicar

### 1. Contas e chaves (uma vez)
- **Travelpayouts (voos, gratuita):** crie a conta em travelpayouts.com e copie o **API token** em *Profile → API token*. Se quiser ganhar comissão nas vendas, copie também o seu **marker** (ID de afiliado).
- **SerpApi (hotéis, paga e opcional):** crie a conta em serpapi.com e copie a **API key**. Com 25 buscas/dia você gasta cerca de 750 por mês; escolha um plano que cubra isso ou ajuste `HOTELS_PER_RUN`. Sem essa chave, os hotéis ficam na estimativa e o resto funciona normalmente.

### 2. GitHub
1. Crie um repositório e envie esta pasta inteira.
2. Em **Settings → Secrets and variables → Actions → Secrets**, crie:
   - `TP_TOKEN` com o token da Travelpayouts (obrigatório para voos)
   - `TP_MARKER` com o seu marker (opcional)
   - `SERPAPI_KEY` com a chave da SerpApi (opcional)
3. Em **Settings → Actions → General → Workflow permissions**, marque **Read and write permissions**.
4. Na aba **Actions**, abra *Atualizar preços* e clique em **Run workflow** para a primeira coleta. Leva cerca de 40 minutos.

### 3. Hospedagem (escolha uma)
- **Vercel, Netlify ou Cloudflare Pages (recomendado):** importe o repositório, sem comando de build, com diretório de saída/publicação `docs`. Cada commit diário de preços republica o site automaticamente.
- **Servidor próprio (FTP):** envie o conteúdo de `docs/` para o servidor. No arquivo do workflow, descomente o passo **Enviar preços por FTP** e crie os secrets `FTP_HOST`, `FTP_USER`, `FTP_PASS` e `FTP_DIR`. Assim só o `prices.json` é reenviado todo dia.
- **Servidor com Node 18+ e cron (sem GitHub):** agende `17 5 * * * cd /caminho/do/projeto && TP_TOKEN=... SERPAPI_KEY=... node collector/collect.mjs`.

## Ajustes comuns
| O quê | Onde |
|---|---|
| Aeroporto de saída padrão e cidades da lista | `CONFIG` em `docs/js/data.js` |
| Aeroportos de saída com voos reais | variável `ORIGINS` (Settings → Variables) |
| Custos base, perfis de sazonalidade, notas das companhias | `docs/js/data.js` |
| Buscas de hotel por dia | variável `HOTELS_PER_RUN` (Settings → Variables) |
| Meses à frente para voos | variável `MONTHS_AHEAD` (padrão 6; mais meses = mais tempo de coleta) |
| Horário da coleta | `cron` em `.github/workflows/atualizar-precos.yml` (em UTC) |

Os feriados (Carnaval, Páscoa, Ano-Novo Chinês, Ação de Graças, Golden Week etc.) e os atalhos de período são calculados automaticamente para cada ano. A tabela do Ano-Novo Chinês vai até 2040.

## Testar localmente
```bash
cd docs && python3 -m http.server 8080      # abra http://localhost:8080
TP_TOKEN=seu_token node collector/collect.mjs
# teste rápido com poucos destinos:
TP_TOKEN=seu_token ORIGINS=VIX,GRU ONLY_DESTINATIONS=MCO,JFK MONTHS_AHEAD=3 node collector/collect.mjs
```
Abrir o `index.html` direto do disco funciona, mas só com estimativas, porque o navegador bloqueia a leitura do `prices.json` fora de um servidor.

## Limites que vale saber
- **Voos:** o preço é a menor tarifa encontrada no mês da chegada, não a das datas exatas. O link de cada companhia abre a busca na Aviasales para conferir e comprar.
- **Tempo de voo:** quando a API não informa o tempo, o site mostra um valor aproximado com "~".
- **Notas de qualidade:** são estimativas baseadas no ranking Skytrax 2026 e ficam em `AIRLINE_INFO` (`data.js`).
- **Alimentação e transporte local:** continuam sendo estimativas do modelo.

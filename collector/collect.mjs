#!/usr/bin/env node
/**
 * Roots — coletor diário de preços
 *
 * Gera docs/data/prices.json com:
 *   - voos reais (menor tarifa de ida e volta por companhia, por destino e mês), um arquivo por aeroporto de saída
 *     em docs/data/flights/XXX.json — Aviasales Data API / Travelpayouts
 *   - hotéis reais (diária mediana de hotéis 3–4★ por região e mês, em rodízio) — Google Hotels via SerpApi (opcional)
 *   - câmbio do dia (US$, C$, MX$ e ¥ em reais) — AwesomeAPI (gratuita, sem chave)
 *
 * Sem dependências: Node 18+ (usa fetch nativo).
 *
 * Variáveis de ambiente:
 *   TP_TOKEN            token da Travelpayouts (obrigatório para voos)
 *   TP_MARKER           seu marker de afiliado Travelpayouts (opcional; entra nos links de compra)
 *   SERPAPI_KEY         chave da SerpApi (opcional; sem ela os hotéis ficam na estimativa)
 *   ORIGINS             aeroportos de saída coletados (padrão GRU,GIG,BSB,CNF,VIX,SSA,REC,FOR,POA,CWB)
 *   MONTHS_AHEAD        meses à frente para voos (padrão 6)
 *   HOTELS_PER_RUN      buscas de hotel por execução (padrão 25 ≈ 750/mês)
 *   HOTEL_MAX_AGE_DAYS  idade a partir da qual um preço de hotel é renovado (padrão 21)
 *   REQ_PER_SEC         limite de requisições por segundo (padrão 4)
 *   ONLY_DESTINATIONS   lista de aeroportos para testar (ex.: "MCO,JFK")
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'docs');
const OUT = path.join(SITE, 'data', 'prices.json');

const env = process.env;
const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);
const TP_TOKEN = env.TP_TOKEN || '';
const TP_MARKER = env.TP_MARKER || '';
const SERPAPI_KEY = env.SERPAPI_KEY || '';
const MONTHS_AHEAD = int(env.MONTHS_AHEAD, 6);
const ORIGINS = (env.ORIGINS || 'GRU,GIG,BSB,CNF,VIX,SSA,REC,FOR,POA,CWB').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
const HOTELS_PER_RUN = int(env.HOTELS_PER_RUN, 25);
const HOTEL_MAX_AGE_DAYS = int(env.HOTEL_MAX_AGE_DAYS, 21);
const REQ_PER_SEC = Math.max(0.5, Number(env.REQ_PER_SEC) || 4);
const ONLY = (env.ONLY_DESTINATIONS || '').split(',').map(s => s.trim()).filter(Boolean);
const TP_BASE = env.TP_BASE || 'https://api.travelpayouts.com';
const SERP_BASE = env.SERP_BASE || 'https://serpapi.com';
const FX_URL = env.FX_URL || 'https://economia.awesomeapi.com.br/json/last/USD-BRL,CAD-BRL,MXN-BRL,CNY-BRL,JPY-BRL';
const FLIGHT_KEEP_DAYS = 10;  // mantém um preço antigo de voo por até 10 dias se a busca do dia não achar nada (a cobertura vai acumulando)
const DAY = 864e5;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ageDays = iso => (iso ? (Date.now() - Date.parse(iso)) / DAY : Infinity);

/* ---------- dados do site (js/data.js) ---------- */
async function loadSiteData() {
  const code = await fs.readFile(path.join(SITE, 'js', 'data.js'), 'utf8');
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.window.TRIP_DATA;
}

/* ---------- HTTP com limite de taxa e novas tentativas ---------- */
let nextSlot = 0;
async function slot() {
  const gap = 1000 / REQ_PER_SEC, now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + gap;
  if (at > now) await sleep(at - now);
}
async function getJson(url, headers = {}, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    await slot();
    try {
      const r = await fetch(url, { headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate', ...headers }, signal: AbortSignal.timeout(25000) });
      if (r.status === 429 || r.status >= 500) throw Object.assign(new Error(`HTTP ${r.status}`), { retry: true });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return await r.json();
    } catch (e) {
      const retry = e.retry || e.name === 'TimeoutError' || e.name === 'TypeError';
      if (!retry || i === tries) throw e;
      await sleep(1500 * i * i);
    }
  }
}
async function pool(items, workers, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k); }
  }));
}

/* ---------- datas ---------- */
function nextMonths(n) {
  const d = new Date(), out = [];
  for (let k = 0; k < n; k++) {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1));
    out.push(t.toISOString().slice(0, 7));
  }
  return out;
}
const thisMonth = () => new Date().toISOString().slice(0, 7);

/* ---------- câmbio (R$ por 1 unidade de cada moeda) ---------- */
async function fetchFx(prev) {
  const out = { ...(prev?.fx || {}) };
  try {
    const j = await getJson(FX_URL);
    for (const c of ['USD', 'CAD', 'MXN', 'CNY', 'JPY']) {
      const v = parseFloat(j?.[c + 'BRL']?.bid);
      if (v > 0.001 && v < 50) out[c] = v;
    }
    if (!out.USD) throw new Error('resposta sem USDBRL.bid');
    log(`câmbio: ${Object.entries(out).map(([k, v]) => `${k} R$ ${v.toFixed(4)}`).join(' · ')}`);
    return { fx: out, at: new Date().toISOString() };
  } catch (e) {
    log(`câmbio: fonte 1 falhou (${e.message}); tentando a fonte 2`);
    try {
      const j = await getJson(env.FX_URL2 || 'https://open.er-api.com/v6/latest/USD');
      const r = j?.rates, brl = r?.BRL;
      if (!(brl > 0)) throw new Error('resposta sem BRL');
      out.USD = brl;
      for (const c of ['CAD', 'MXN', 'CNY', 'JPY']) if (r[c] > 0) out[c] = brl / r[c];
      log(`câmbio (fonte 2): ${Object.entries(out).map(([k, v]) => `${k} R$ ${v.toFixed(4)}`).join(' · ')}`);
      return { fx: out, at: new Date().toISOString() };
    } catch (e2) {
      log(`câmbio: falhou (${e2.message}); mantendo o anterior`);
      return prev;
    }
  }
}

/* ---------- voos (Aviasales Data API) ---------- */
function buyLink(link) {
  if (!link) return null;
  try {
    const u = new URL(link.startsWith('http') ? link : link.startsWith('/') ? 'https://www.aviasales.com' + link : 'https://www.aviasales.com/search/' + link);
    if (TP_MARKER) u.searchParams.set('marker', TP_MARKER);
    return u.toString();
  } catch { return null; }
}
function aggregateFlights(items, now) {
  const airlines = {};
  for (const it of items || []) {
    const p = Number(it.price);
    if (!(p > 0) || !it.airline) continue;
    const rt = !!it.return_at;
    const price = Math.round(rt ? p : p * 2);            // só ida → estima ida e volta dobrando
    const dur = it.duration_to ?? (it.duration ? (rt ? Math.round(it.duration / 2) : it.duration) : null);
    const cur = airlines[it.airline];
    if (!cur || price < cur.price) {
      airlines[it.airline] = {
        price, rt, transfers: it.transfers ?? null, dur: dur ?? null,
        dep: it.departure_at || null, ret: it.return_at || null, link: buyLink(it.link)
      };
    }
  }
  const prices = Object.values(airlines).map(a => a.price);
  if (!prices.length) return null;
  return { min: Math.min(...prices), n: prices.length, airlines, at: now };
}
const kmBetween = (a, b) => { const R = 6371, r = Math.PI / 180, dl = (b[0] - a[0]) * r, dn = (b[1] - a[1]) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
async function collectFlights(D, origin, prev) {
  const flights = structuredClone(prev || {});
  if (!TP_TOKEN) { log('voos: TP_TOKEN não definido — pulando (mantendo dados anteriores)'); return { flights, req: 0, fail: 0 }; }
  // destinos a mais de 300 km da origem (mais perto, o site sugere ir de carro)
  // cidades sem aeroporto (código com _) usam o aeroporto de referência (4º valor em AP)
  let dests = [...new Set(Object.values(D.GW).map(c => (D.AP[c] && D.AP[c][3]) || c))].filter(c => c !== origin && D.AP[c] && D.AP[origin] && kmBetween(D.AP[origin], D.AP[c]) >= 300);
  if (ONLY.length) dests = dests.filter(c => ONLY.includes(c));
  const months = nextMonths(MONTHS_AHEAD);
  const jobs = dests.flatMap(dest => months.map(ym => ({ dest, ym })));
  const now = new Date().toISOString();
  let req = 0, fail = 0, got = 0;
  log(`voos ${origin}: ${dests.length} destinos × ${months.length} meses = ${jobs.length} buscas`);
  await pool(jobs, 3, async ({ dest, ym }) => {
    const q = new URLSearchParams({
      origin, destination: dest, departure_at: ym, one_way: 'false', direct: 'false',
      sorting: 'price', currency: 'usd', market: 'br', limit: '200', page: '1', token: TP_TOKEN
    });
    req++;
    try {
      const j = await getJson(`${TP_BASE}/aviasales/v3/prices_for_dates?${q}`, { 'X-Access-Token': TP_TOKEN });
      if (j && j.success === false) throw new Error(j.error || 'success=false');
      const agg = aggregateFlights(j?.data, now);
      flights[dest] ??= {};
      if (agg) { flights[dest][ym] = agg; got++; }
      else if (ageDays(flights[dest][ym]?.at) > FLIGHT_KEEP_DAYS) delete flights[dest][ym];
    } catch (e) {
      fail++;
      if (fail <= 5) log(`voos: ${origin}→${dest} ${ym} falhou: ${e.message}`);
      if (flights[dest]?.[ym] && ageDays(flights[dest][ym].at) > FLIGHT_KEEP_DAYS) delete flights[dest][ym];
    }
    if (req % 300 === 0) log(`voos ${origin}: ${req}/${jobs.length}`);
  });
  // remove meses que já passaram e destinos vazios
  const cm = thisMonth();
  for (const d of Object.keys(flights)) {
    for (const ym of Object.keys(flights[d])) if (ym < cm) delete flights[d][ym];
    if (!Object.keys(flights[d]).length) delete flights[d];
  }
  log(`voos ${origin}: ${got} meses com preço, ${fail} falhas de ${req} buscas`);
  return { flights, req, fail };
}

/* ---------- hotéis (Google Hotels via SerpApi) ---------- */
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function checkInFor(ym) {
  const [y, m] = ym.split('-').map(Number);
  let t = Date.UTC(y, m - 1, 15);
  const soon = Date.now() + 3 * DAY;
  if (t < soon) t = soon;
  const ci = new Date(t).toISOString().slice(0, 10), co = new Date(t + 2 * DAY).toISOString().slice(0, 10);
  return [ci, co];
}
async function collectHotels(D, prev) {
  const hotels = structuredClone(prev || {});
  if (!SERPAPI_KEY) { log('hotéis: SERPAPI_KEY não definida — hotéis seguem na estimativa'); return { hotels, req: 0, fail: 0 }; }
  const all = nextMonths(12), sample = [all[1], all[3], all[6], all[9]].filter(Boolean);
  const CC = { BR: 'BRA', US: 'USA', CA: 'CAN', MX: 'MEX', CN: 'CHN', JP: 'JPN' };
  const cands = [];
  for (const id of Object.keys(D.R)) for (const ym of sample) {
    const age = ageDays(hotels[id]?.[ym]?.at);
    if (age > HOTEL_MAX_AGE_DAYS) cands.push({ id, ym, age });
  }
  // mais antigos primeiro; entre os nunca buscados, cobre todas as regiões no mês mais próximo antes de repetir região
  cands.sort((a, b) => (b.age - a.age) || a.ym.localeCompare(b.ym) || a.id.localeCompare(b.id));
  const pick = cands.slice(0, HOTELS_PER_RUN);
  log(`hotéis: ${cands.length} pendentes, buscando ${pick.length} nesta execução`);
  const now = new Date().toISOString();
  let req = 0, fail = 0;
  await pool(pick, 2, async ({ id, ym }) => {
    const [ci, co] = checkInFor(ym);
    const country = D.COUNTRIES[CC[id.slice(0, 2)]].name;
    const q = new URLSearchParams({
      engine: 'google_hotels', q: `hotéis em ${D.R[id][0]}, ${country}`, check_in_date: ci, check_out_date: co,
      adults: '2', currency: 'USD', gl: 'br', hl: 'pt-br', hotel_class: '3,4', api_key: SERPAPI_KEY
    });
    req++;
    try {
      const j = await getJson(`${SERP_BASE}/search.json?${q}`);
      if (j?.error) throw new Error(j.error);
      const rates = (j?.properties || []).map(p => Number(p?.rate_per_night?.extracted_lowest)).filter(v => v > 5 && v < 5000);
      if (rates.length >= 3) {
        hotels[id] ??= {};
        hotels[id][ym] = { nightly: Math.round(median(rates)), n: rates.length, at: now };
      } else log(`hotéis: ${id} ${ym} com poucos resultados (${rates.length})`);
    } catch (e) {
      fail++;
      log(`hotéis: ${id} ${ym} falhou: ${e.message}`);
    }
  });
  // remove meses passados e preços muito antigos (90 dias)
  const cm = thisMonth();
  for (const id of Object.keys(hotels)) {
    for (const ym of Object.keys(hotels[id])) if (ym < cm || ageDays(hotels[id][ym].at) > 90) delete hotels[id][ym];
    if (!Object.keys(hotels[id]).length) delete hotels[id];
  }
  log(`hotéis: ${req - fail} buscas ok, ${fail} falhas`);
  return { hotels, req, fail };
}

async function writeJson(file, obj) {
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(obj));
  await fs.rename(tmp, file);
}

/* ---------- principal ---------- */
async function main() {
  const D = await loadSiteData();
  let prev = {};
  try { prev = JSON.parse(await fs.readFile(OUT, 'utf8')); } catch { /* primeira execução */ }

  const fx = await fetchFx(prev.fx || prev.usdBrl ? { fx: prev.fx || { USD: prev.usdBrl }, at: prev.fxAt } : null);

  // voos: um arquivo por aeroporto de saída
  const FL_DIR = path.join(SITE, 'data', 'flights');
  await fs.mkdir(FL_DIR, { recursive: true });
  const F = { req: 0, fail: 0 }, origins = [];
  for (const origin of ORIGINS) {
    if (!D.AP[origin]) { log(`origem ${origin} desconhecida em data.js — pulando`); continue; }
    const file = path.join(FL_DIR, origin + '.json');
    let prevF = {};
    try { prevF = JSON.parse(await fs.readFile(file, 'utf8')).flights || {}; } catch { /* primeira vez */ }
    if (origin === (prev.origin || 'VIX') && prev.flights && !Object.keys(prevF).length) prevF = prev.flights;  // formato antigo
    const r = await collectFlights(D, origin, prevF);
    F.req += r.req; F.fail += r.fail;
    await writeJson(file, { origin, updatedAt: new Date().toISOString(), currency: 'USD', flights: r.flights });
    if (Object.keys(r.flights).length) origins.push(origin);
  }

  const H = await collectHotels(D, prev.hotels);

  const out = {
    version: 2,
    updatedAt: new Date().toISOString(),
    currency: 'USD',
    usdBrl: fx?.fx?.USD ?? null,
    fx: fx?.fx ?? {},
    fxAt: fx?.at ?? null,
    origins,                       // aeroportos de saída com voos reais em data/flights/
    hotels: H.hotels,
    sources: {
      flights: 'Aviasales Data API (Travelpayouts) — menores tarifas encontradas em buscas reais',
      hotels: 'Google Hotels via SerpApi — diária mediana de hotéis 3–4★',
      fx: 'AwesomeAPI'
    }
  };
  await writeJson(OUT, out);
  log(`gravado ${path.relative(ROOT, OUT)}: voos reais saindo de ${origins.length} aeroportos, ${Object.keys(out.hotels).length} regiões com hotel`);

  // falha visível (e-mail do GitHub) se quase todas as buscas de voo falharem
  if (F.req > 0 && F.fail / F.req > 0.8) {
    console.error(`ERRO: ${F.fail} de ${F.req} buscas de voo falharam. Confira o TP_TOKEN e o limite da API.`);
    process.exitCode = 1;
  }
}

main().catch(e => { console.error('ERRO fatal:', e); process.exitCode = 1; });

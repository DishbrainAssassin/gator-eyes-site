// Trade history: every buy and sell for one Solada.fun or Snek.fun coin, newest first, with
// side / size / wallet filters and a CSV download. Pages come from the worker's /coin-trades.
import { getApi, price as fmtPrice } from "./api.js?v=20261101-nav1";
import { coinUrl, fetchFeed } from "./data.js?v=20261101-nav1";
import { esc, fmt, compact } from "./ui.js?v=20261101-nav1";
import { wireLinks, liveStatus } from "./common.js?v=20261101-nav1";
import * as platform from "./platform.js?v=20261101-nav1";
import { pill } from "./platform.js?v=20261101-nav1";

wireLinks();
platform.mount();
platform.on(() => fillList());
const $ = (s) => document.querySelector(s);

// Pages per batch and the hard stop (100 pages ≈ 5,000 Solada trades), matching the holder snapshot.
const BATCH = 6, MAX_PAGES = 100;
const st = { coins: [], coin: null, dec: 6, list: [], seen: new Set(), before: "", more: true, pages: 0, busy: false, run: 0, side: "", min: 0, wallet: "", shown: 200 };

const short = (a) => (a && a.length > 24 ? a.slice(0, 12) + "…" + a.slice(-8) : a || "");
const when = (ms) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/New_York" });
const clock = (ms) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/New_York" });
const day = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const dateET = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many || one + "s"}`;
// Token amounts: 1.0B, 54.7M, 12.3k, else plain.
const amt = (n) => (!isFinite(n) ? "–" : Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B" : Math.abs(n) >= 1e4 ? compact(n) : fmt(n, n < 10 ? 2 : 0));
const ada = (n) => fmt(n, n < 10 ? 2 : n < 1000 ? 1 : 0);
const VENUE = { curve: "Bonding curve", minswap: "Minswap pool", "snek-splash": "Snek.fun (Splash)", splash: "Splash pool" };
const venue = (v) => VENUE[v] || (v ? v.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "–");

function notice(html) { const n = $("[data-notice]"); n.hidden = !html; n.innerHTML = html || ""; }

function resolve(input) {
  let s = (input || "").trim();
  // Accept a Solada.fun or Snek.fun coin link, a $ticker, or a coin id / slug.
  const m = s.match(/solada\.fun\/(?:coin|token|c)\/([A-Za-z0-9_-]+)/i) || s.match(/snek\.fun\/(?:token|coin)\/([0-9a-f]{58,})/i);
  if (m) s = m[1];
  s = s.replace(/^\$/, "");
  // Tickers can repeat across launchpads: a coin in the chosen launchpad scope wins, then any coin.
  const byTk = st.coins.filter((c) => (c.tk || "").toLowerCase() === s.toLowerCase());
  return byTk.find((c) => platform.inScope(c)) || byTk[0] || st.coins.find((c) => c.id === s || c.slug === s) || null;
}

function fillList() {
  const seen = new Set();
  $("[data-list]").innerHTML = st.coins.filter((c) => c.tk && platform.inScope(c) && !seen.has(c.tk + "|" + platform.srcOf(c)) && seen.add(c.tk + "|" + platform.srcOf(c)))
    .map((c) => `<option value="${esc(c.tk)}">${esc(c.name || "")}${platform.get() === "all" && c.src === "snek" ? " · Snek.fun" : ""}</option>`).join("");
}

async function loadList() {
  try {
    const j = await getApi("/tokens");
    st.coins = j.coins || [];
    let sources; try { sources = (await fetchFeed()).sources || undefined; } catch {}
    liveStatus({ updatedAt: new Date(j.updatedAt), sources });
    fillList();
  } catch (e) { liveStatus(null, e); }
}

// Reads up to `pages` more pages of older trades. Solada pages by timestamp (and repeats the boundary
// trade, so rows are de-duplicated); Snek.fun pages by offset, which the worker hands back as `next`.
async function loadPages(pages) {
  if (st.busy || !st.more || !st.coin) return;
  const run = st.run, c = st.coin;
  st.busy = true;
  const prog = $("[data-progress]");
  prog.hidden = false;
  buttons();
  try {
    for (let i = 0; i < pages && st.more && st.pages < MAX_PAGES; i++) {
      const j = await getApi("/coin-trades", { coin: c.slug || c.id, before: st.before });
      if (run !== st.run) return;
      if (j.dec != null) st.dec = Number(j.dec) || 0;
      const t = j.trades || [];
      for (const x of t) {
        const k = `${x.at}|${x.side}|${x.trader}|${x.tokens}|${x.ada}`;
        if (st.seen.has(k)) continue;
        st.seen.add(k);
        st.list.push({ at: Number(x.at), side: x.side === "sell" ? "sell" : "buy", ada: Number(x.ada) || 0, tokens: Number(x.tokens) / 10 ** st.dec, trader: x.trader || "", venue: x.venue || "", tx: x.tx || "" });
      }
      st.pages++;
      st.more = !!(j.more && t.length);
      if (t.length) st.before = j.next != null ? String(j.next) : String(t[t.length - 1].at);
      prog.textContent = `Reading trade history… ${fmt(st.list.length)} trades so far`;
      render();
    }
  } catch (err) {
    if (run !== st.run) return;
    if (!st.list.length && !st.pages) { st.more = false; notice(`<strong>Couldn't find ${esc(c.tk || c.id)}.</strong> Check the ticker, or paste the coin's Solada.fun or Snek.fun link. ${/404/.test(String(err.message || err)) ? "" : esc(err.message || err)}`); }
    else notice(`<strong>Couldn't read more of the trade history.</strong> ${esc(err.message || err)}. What loaded so far is shown below.`);
  } finally {
    if (run === st.run) { st.busy = false; prog.hidden = true; buttons(); render(); }
  }
}

function buttons() {
  const capped = st.pages >= MAX_PAGES && st.more;
  $("[data-older]").disabled = st.busy || !st.more || capped;
  $("[data-all]").disabled = st.busy || !st.more || capped;
  $("[data-older]").textContent = st.busy ? "Loading…" : "Load older trades";
  $("[data-csv]").disabled = st.busy && !st.list.length;
}

function filtered() {
  const w = st.wallet.toLowerCase();
  return st.list.filter((t) => (!st.side || t.side === st.side) && t.ada >= st.min && (!w || t.trader.toLowerCase().includes(w)));
}

function render() {
  if (!st.coin) return;
  const c = st.coin, rows = filtered();
  // Oldest trade reached and whether the full history is in.
  const oldest = st.list.length ? st.list[st.list.length - 1].at : null;
  const newest = st.list.length ? st.list[0].at : null;
  const capped = st.pages >= MAX_PAGES && st.more;
  $("[data-range]").textContent = !st.list.length ? "" : st.more
    ? `Loaded back to ${when(oldest)} ET${capped ? " (5,000-trade limit)" : ""}`
    : `Full history: ${dateET(oldest)} to ${dateET(newest)}`;
  // KPIs over the filtered rows.
  let b = 0, s = 0, bAda = 0, sAda = 0, bTok = 0, sTok = 0;
  const wallets = new Set();
  for (const t of rows) { if (t.side === "buy") { b++; bAda += t.ada; bTok += t.tokens; } else { s++; sAda += t.ada; sTok += t.tokens; } if (t.trader) wallets.add(t.trader); }
  const net = bAda - sAda;
  const kpi = (label, value, sub, cls = "") => `<div class="kpi"><span class="kpi-label">${label}</span><span class="kpi-value ${cls}">${value}</span><span class="kpi-sub">${sub}</span></div>`;
  $("[data-kpis]").innerHTML = [
    kpi("Trades", fmt(rows.length), `${fmt(b)} buys · ${fmt(s)} sells`),
    kpi("ADA in (buys)", ada(bAda), `${amt(bTok)} tokens bought`, "pos"),
    kpi("ADA out (sells)", ada(sAda), `${amt(sTok)} tokens sold`, "neg"),
    kpi("Net flow", (net > 0 ? "+" : net < 0 ? "−" : "") + ada(Math.abs(net)) + " ADA", net > 0 ? "More ADA bought than sold" : net < 0 ? "More ADA sold than bought" : "Even", net > 0 ? "pos" : net < 0 ? "neg" : ""),
    kpi("Wallets", fmt(wallets.size), "distinct addresses in these trades"),
    kpi("Biggest trade", rows.length ? ada(Math.max(...rows.map((t) => t.ada))) + " ADA" : "–", rows.length ? (rows.reduce((a, t) => (t.ada > a.ada ? t : a)).side === "buy" ? "a buy" : "a sell") : ""),
  ].join("");
  const shown = rows.slice(0, st.shown);
  $("[data-rows]").innerHTML = shown.length ? shown.map((t) => {
    const p = t.tokens > 0 ? t.ada / t.tokens : null;
    const wl = t.trader ? `<a href="https://cardanoscan.io/address/${esc(t.trader)}" target="_blank" rel="noopener" class="mono" title="${esc(t.trader)}"><span class="w-long">${esc(short(t.trader))}</span><span class="w-short">…${esc(t.trader.slice(-6))}</span></a>` : "–";
    const tx = t.tx ? ` <a class="cell-sub" href="https://cardanoscan.io/transaction/${esc(t.tx)}" target="_blank" rel="noopener">tx</a>` : "";
    return `<tr class="is-${t.side}">
      <td class="th-when"><time datetime="${new Date(t.at).toISOString()}" title="${esc(when(t.at))} ET">${esc(clock(t.at))}</time><span class="cell-sub">${esc(day(t.at))}</span></td>
      <td><span class="badge" style="--k:var(--color-${t.side})">${t.side === "buy" ? "Buy" : "Sell"}</span></td>
      <td class="num ${t.side === "buy" ? "pos" : "neg"}">${ada(t.ada)}</td>
      <td class="num">${amt(t.tokens)}</td>
      <td class="num hide-sm">${p != null ? fmtPrice(p) : "–"}</td>
      <td>${wl}</td>
      <td class="hide-sm"><span class="cell-sub" style="font-family:var(--font-body)">${esc(venue(t.venue))}</span>${tx}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="7"><div class="empty"><p>${st.list.length ? "No trades match these filters." : st.busy ? "Reading trades…" : "Nothing to show."}</p></div></td></tr>`;
  $("[data-more]").hidden = rows.length <= st.shown;
  $("[data-more]").textContent = `Show more (${fmt(rows.length - st.shown)} left)`;
  const f = rows.length !== st.list.length ? ` · ${fmt(rows.length)} match your filters` : "";
  $("[data-count]").textContent = st.list.length ? `${plural(st.list.length, "trade")} loaded${f}${st.more ? "" : " · that's the whole history"}` : "";
  const u = new URL(location.href); u.searchParams.set("coin", c.tk || c.id); history.replaceState(null, "", u);
}

async function loadCoin(e) {
  if (e) e.preventDefault();
  const raw = $("[data-coin]").value;
  const c = resolve(raw);
  notice("");
  if (!c) {
    // Unknown ticker: let the worker try the raw id/slug anyway so pasted links to older coins still work.
    const s = raw.trim().replace(/^\$/, "");
    const m = s.match(/solada\.fun\/(?:coin|token|c)\/([A-Za-z0-9_-]+)/i) || s.match(/snek\.fun\/(?:token|coin)\/([0-9a-f]{58,})/i);
    const id = m ? m[1] : s;
    if (!id) return;
    st.coin = { id, slug: id, tk: id.length > 20 ? id.slice(0, 8) + "…" : id, name: "", src: /^[0-9a-f]{100,}$/i.test(id) ? "snek" : "solada" };
  } else st.coin = c;
  st.run++;
  st.list = []; st.seen = new Set(); st.before = ""; st.more = true; st.pages = 0; st.busy = false; st.shown = 200; st.dec = st.coin.src === "snek" ? 0 : 6;
  const btn = $("[data-go]");
  btn.disabled = true; btn.textContent = "Loading…";
  const cc = st.coin, snek = cc.src === "snek";
  const im = cc.img ? `<img src="${esc(cc.img)}" alt="" width="36" height="36">` : "";
  $("[data-head]").innerHTML = `${im}<div><h2 class="panel-title">Every <a href="${esc(coinUrl(snek ? cc.id : cc.slug || cc.id))}" target="_blank" rel="noopener">${esc(cc.tk || "?")}</a> trade ${pill(snek ? "snek" : "solada", { button: false })}</h2><span class="cell-sub">${esc(cc.name || "")}${cc.name ? " · " : ""}<a href="./holders.html?coin=${encodeURIComponent(cc.tk || cc.id)}">Holder snapshot</a> · <a href="./followup.html?coin=${encodeURIComponent(cc.tk || cc.id)}">Alert follow-up</a></span></div>`;
  $("[data-result]").hidden = false;
  $("[data-table]").hidden = false;
  $("[data-rows]").innerHTML = Array.from({ length: 8 }, () => `<tr><td colspan="7"><div class="skel-block" style="min-height:32px"></div></td></tr>`).join("");
  $("[data-kpis]").innerHTML = "";
  $("[data-range]").textContent = "";
  $("[data-count]").textContent = "";
  try {
    // First page on its own so something shows fast, then the rest of the first batch.
    st.busy = false;
    await loadPages(1);
    if (!st.list.length && !st.more && $("[data-notice]").hidden) notice(`<strong>No trades reported for ${esc(cc.tk || cc.id)} yet.</strong>`);
    await loadPages(BATCH - 1);
  } finally {
    btn.disabled = false; btn.textContent = "Show trades";
    render();
  }
}

function csv() {
  const c = st.coin, rows = filtered();
  if (!c || !rows.length) return;
  const lines = ["time_et,time_iso,side,ada,tokens,price_ada_per_token,wallet,venue,tx"];
  const cell = (x) => '"' + String(x ?? "").replace(/"/g, '""') + '"';
  for (const t of rows) lines.push([when(t.at), new Date(t.at).toISOString(), t.side, t.ada, t.tokens, t.tokens > 0 ? (t.ada / t.tokens).toPrecision(8) : "", t.trader, t.venue, t.tx].map(cell).join(","));
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(c.tk || c.id).replace(/[^A-Za-z0-9_-]/g, "")}-trades-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

$("[data-pick]").addEventListener("submit", loadCoin);
document.querySelectorAll("[data-side]").forEach((b) => b.addEventListener("click", () => {
  st.side = b.dataset.side;
  document.querySelectorAll("[data-side]").forEach((x) => x.classList.toggle("is-on", x === b));
  st.shown = 200; render();
}));
$("[data-min]").addEventListener("input", (e) => { st.min = Number(e.target.value) || 0; st.shown = 200; render(); });
$("[data-wallet]").addEventListener("input", (e) => { st.wallet = e.target.value.trim(); st.shown = 200; render(); });
$("[data-older]").addEventListener("click", () => loadPages(BATCH));
$("[data-all]").addEventListener("click", () => loadPages(MAX_PAGES));
$("[data-more]").addEventListener("click", () => { st.shown += 200; render(); });
$("[data-csv]").addEventListener("click", csv);

await loadList();
const q = new URLSearchParams(location.search);
const pre = q.get("coin");
if (q.get("wallet")) { st.wallet = q.get("wallet"); $("[data-wallet]").value = st.wallet; }
if (pre) { $("[data-coin]").value = pre; loadCoin(); }

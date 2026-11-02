// Graduated coins: every coin that left its bonding curve for a regular pool, on Cardano
// (Solada.fun to Minswap, Snek.fun to Splash) or Solana (Solada Pump coins to PumpSwap),
// with when it graduated, how long it took and how it trades now.
import { getApi, price, pct, signed, span } from "./api.js?v=20261102-watchcopy";
import { coinUrl } from "./data.js?v=20261102-watchcopy";
import { esc, fmt, compact, timeAgo } from "./ui.js?v=20261102-watchcopy";
import { wireLinks, liveStatus } from "./common.js?v=20261102-watchcopy";
import * as platform from "./platform.js?v=20261102-watchcopy";
import * as watchlist from "./watchlist.js?v=20261102-watchcopy";
import { pill, LP } from "./platform.js?v=20261102-watchcopy";
import { starBtn } from "./watchlist.js?v=20261102-watchcopy";

wireLinks();
platform.mount();
watchlist.wire();
platform.on(() => { st.more = false; render(); });

const $ = (s) => document.querySelector(s);
const rowsEl = $("[data-rows]"), moreBtn = $("[data-more]"), notice = $("[data-notice]");
const params = new URLSearchParams(location.search);
const WHEN = { all: Infinity, d1: 864e5, d7: 7 * 864e5, d30: 30 * 864e5 };
const CHAINS = ["all", "cardano", "solana"];
const st = { ch: CHAINS.includes(params.get("chain")) ? params.get("chain") : "all", sol: {}, s: "recent", sort: null, dir: -1, t: WHEN[params.get("t")] ? params.get("t") : "all", q: (params.get("q") || "").trim(), more: false, data: null };
document.querySelectorAll("[data-t]").forEach((x) => x.classList.toggle("is-on", x.dataset.t === st.t));
if (st.q) $("[data-search]").value = st.q;

// Solada Pump coins graduate on Solana when their Pump.fun curve fills (100% = 10,000 bps).
const isSolGrad = (c) => c.kind === "pump" && Number(c.prog) >= 10000;
const chainOf = (c) => (c.kind === "pump" ? "solana" : "cardano");
const isGrad = (c) => c.cs === "graduated" || isSolGrad(c);
const inChain = (c) => st.ch === "all" || chainOf(c) === st.ch;
// Solana graduation time = when the coin's PumpSwap pool opened. Filled in from GeckoTerminal.
const withSol = (c) => {
  const x = c.pair && st.sol[c.pair];
  return x ? { ...c, gAt: c.gAt || x.at || null, solV: x.v } : c;
};
const took = (c) => (c.gAt && c.born && c.gAt > c.born ? c.gAt - c.born : null);
const h24 = (c) => (c.w && c.w.h24) || { v: 0, n: 0, b: 0, s: 0, net: 0, wal: 0, ch: null };

function val(c, k) {
  const w = h24(c);
  switch (k) {
    case "recent": return c.gAt || 0;
    case "fast": return took(c) == null ? -Infinity : -took(c);
    case "mc": case "big": return c.mc ?? -1;
    case "hold": return c.hold ?? -1;
    case "v": return w.v || 0;
    case "ch": return w.ch ?? -1e9;
    case "net": return w.net || 0;
    default: return 0;
  }
}

function gradCell(c) {
  if (chainOf(c) === "solana") {
    if (!c.gAt) return `<span title="Graduated on Solana to a PumpSwap pool">To PumpSwap</span><span class="cell-sub">${st.solTried ? "time unavailable" : "time loading"}</span>`;
    const t = took(c);
    return `<span title="Graduated on Solana to a PumpSwap pool on ${esc(new Date(c.gAt).toLocaleString())}">${esc(timeAgo(c.gAt))}</span><span class="cell-sub">${t != null ? "took " + esc(span(t)) : "to PumpSwap"}</span>`;
  }
  const venue = c.src === "snek" ? "Splash pool" : "Minswap pool";
  if (!c.gAt) return `<span title="Graduated to the ${venue}. Snek.fun does not publish a graduation time.">To Splash</span><span class="cell-sub">time not published</span>`;
  const t = took(c);
  return `<span title="Graduated to the ${venue} on ${esc(new Date(c.gAt).toLocaleString())}">${esc(timeAgo(c.gAt))}</span><span class="cell-sub">${t != null ? "took " + esc(span(t)) : "to Minswap"}</span>`;
}

function actions(c) {
  const id = encodeURIComponent(c.tk || c.id);
  const a = [
    // Trade history and holder snapshot both work for Solada and Snek.fun coins.
    `<a class="icon-btn" href="./trades.html?coin=${id}" title="Every ${esc(c.tk || "")} trade">Trades</a>`,
    `<a class="icon-btn" href="./holders.html?coin=${id}" title="Holder snapshot for ${esc(c.tk || "")}">Holders</a>`,
  ];
  return `<span class="row-actions">${a.join("")}</span>`;
}

function row(c, rate, showPill) {
  const w = h24(c);
  const tot = (w.b || 0) + (w.s || 0);
  const bp = tot ? Math.round((w.b / tot) * 100) : 50;
  const img = c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy" width="28" height="28">` : `<span class="coin-dot"></span>`;
  return `<tr data-id="${esc(c.id)}">
    <td class="star-col">${starBtn(c)}</td>
    <td><div class="coin-cell">${img}<div><a href="${esc(coinUrl(c.id))}" target="_blank" rel="noopener">${esc(c.tk || "?")}</a>${showPill && c.src === "snek" ? pill("snek") : ""}${st.ch !== "solana" && chainOf(c) === "solana" ? `<span class="chain-pill" title="Graduated on Solana"><i></i>Solana</span>` : ""}<span class="cell-sub">${esc((c.name || "").slice(0, 22))}</span></div></div></td>
    <td class="grad-cell">${gradCell(c)}</td>
    <td class="num">${compact(c.mc)}<span class="cell-sub">${c.price != null ? esc(price(c.price)) : ""}</span></td>
    <td class="num hide-sm">${c.hold != null ? fmt(c.hold) : "–"}</td>
    <td class="num">${fmt(w.v)}<span class="cell-sub">${fmt(w.n)} ${w.n === 1 ? "trade" : "trades"}${c.solV != null ? ` · $${esc(compact(c.solV))} on Solana` : ""}</span></td>
    <td class="num hide-sm ${w.ch > 0 ? "pos" : w.ch < 0 ? "neg" : ""}">${pct(w.ch)}</td>
    <td class="num split-col hide-sm"><span class="${w.net > 0 ? "pos" : w.net < 0 ? "neg" : ""}">${signed(w.net)}</span><span class="rowsplit" title="${fmt(w.b)} ADA bought, ${fmt(w.s)} ADA sold"><span class="split-buy" style="width:${bp}%"></span></span></td>
    <td class="hide-sm">${actions(c)}</td>
  </tr>`;
}

function kpis(all) {
  const now = Date.now();
  const timed = all.filter((c) => c.gAt);
  const week = timed.filter((c) => now - c.gAt < 7 * 864e5);
  const tooks = all.map(took).filter((x) => x != null).sort((a, b) => a - b);
  const median = tooks.length ? tooks[Math.floor((tooks.length - 1) / 2)] : null;
  const vol = all.reduce((s, c) => s + (h24(c).v || 0), 0);
  const net = all.reduce((s, c) => s + (h24(c).net || 0), 0);
  const solV = all.reduce((s, c) => s + (c.solV || 0), 0);
  const latest = timed.sort((a, b) => b.gAt - a.gAt)[0];
  const ada = all.filter((c) => chainOf(c) === "cardano").length, sol = all.length - ada;
  const split = st.ch === "all" ? `${fmt(ada)} Cardano · ${fmt(sol)} Solana` : st.ch === "solana" ? "Pump coins on PumpSwap" : platform.get() === "all" ? `${fmt(all.filter((c) => c.src === "snek").length)} on Snek.fun` : "being tracked";
  return [
    ["Graduated", fmt(all.length), split],
    ["This week", fmt(week.length), latest ? "latest: " + (latest.tk || "") + ", " + timeAgo(latest.gAt) : "none with a time"],
    ["Typical time", median != null ? span(median) : "–", tooks.length ? `launch to graduation, median of ${tooks.length}` : "no graduation times"],
    ["24h volume", fmt(vol) + " ADA", `net flow ${signed(net)} ADA${solV ? ` · $${compact(solV)} on Solana` : ""}`],
  ].map(([l, v, s]) => `<div class="kpi"><span class="kpi-label">${esc(l)}</span><span class="kpi-value">${esc(v)}</span><span class="kpi-sub">${esc(s)}</span></div>`).join("");
}

/** "By launchpad" rows like Home and Flows: graduates per launchpad, click one to focus on it. */
function split(all) {
  const scope = platform.get();
  const keys = ["solada", "snek"];
  const by = Object.fromEntries(keys.map((k) => [k, all.filter((c) => (c.src === "snek" ? "snek" : "solada") === k)]));
  const total = all.length || 1;
  const rowFor = (key) => {
    const lp = LP[key], list = by[key];
    const sum = (f) => list.reduce((a, c) => a + (h24(c)[f] || 0), 0);
    const v = sum("v"), b = sum("b"), s = sum("s"), net = b - s;
    const share = (list.length / total) * 100;
    const week = list.filter((c) => c.gAt && Date.now() - c.gAt < 7 * 864e5).length;
    return `<div class="lp-row ${lp.cls} ${scope !== "all" && scope !== key ? "is-dim" : ""}">
      <button type="button" class="lp-name" data-platform-pick="${key}" title="Show ${esc(lp.label)} graduates only"><i></i>${esc(lp.label)}</button>
      <div class="lp-bar" style="--share:${share}%" role="img" aria-label="${esc(lp.label)}: ${list.length} graduated coins, ${Math.round(share)}% of the total"><span class="b" style="width:${v ? (b / v) * 100 : 0}%"></span><span class="s" style="width:${v ? (s / v) * 100 : 0}%"></span></div>
      <span class="lp-num">${fmt(list.length)} graduated · ${Math.round(share)}%<small>${key === "snek" ? "no graduation times" : fmt(week) + " this week"} · ${compact(v)} ADA 24h · net ${net >= 0 ? "+" : "−"}${fmt(Math.abs(net))}</small></span>
    </div>`;
  };
  return `<div class="lp-split-wrap"><div class="sub-row"><h3 class="sub">By launchpad</h3>${scope !== "all" ? `<button type="button" class="link" data-platform="all">Compare all</button>` : `<span class="sub-hint">Pick one to focus on it</span>`}</div><div class="lp-split">${keys.map(rowFor).join("")}</div></div>`;
}

function render() {
  const d = st.data;
  if (!d) return;
  const now = Date.now();
  const allGrads = (d.coins || []).filter((c) => isGrad(c) && inChain(c)).map(withSol);
  $("[data-lp-split]").innerHTML = st.ch === "solana" ? "" : split(allGrads);
  const grads = allGrads.filter((c) => platform.inScope(c));
  $("[data-kpis]").innerHTML = kpis(grads.slice());
  const q = st.q.toLowerCase().replace(/^\$/, "");
  let list = grads.filter((c) => {
    if (st.t !== "all" && !(c.gAt && now - c.gAt < WHEN[st.t])) return false;
    if (q && !`${c.tk || ""} ${c.name || ""} ${c.id}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const key = st.sort || st.s;
  const dir = st.sort ? st.dir : -1;
  // Coins without a graduation time (Snek.fun) sort after timed ones on Newest, then by market cap.
  list.sort((a, b) => dir * (val(a, key) - val(b, key)) || (b.mc || 0) - (a.mc || 0));
  const shown = st.more ? list : list.slice(0, 50);
  const showPill = platform.get() === "all";
  const emptyMsg = st.ch === "solana" && platform.get() === "snek" ? `Snek.fun coins are Cardano-only. <button type="button" class="link" data-platform="all">Show all launchpads</button>` : q ? `No graduated coin matches "${esc(st.q)}".` : st.t !== "all" ? "No coins graduated in this window." : "No graduated coins on this launchpad right now.";
  rowsEl.innerHTML = shown.length ? shown.map((c) => row(c, d.adaUsd, showPill)).join("") : `<tr><td colspan="9"><div class="empty"><p>${emptyMsg}</p></div></td></tr>`;
  watchlist.wire();
  moreBtn.hidden = st.more || list.length <= 50;
  moreBtn.textContent = `Show all ${list.length}`;
  $("[data-updated]").textContent = d.updatedAt ? "Updated " + timeAgo(Date.parse(d.updatedAt)) + "." : "";
}

document.querySelectorAll("[data-s]").forEach((b) => b.addEventListener("click", () => {
  st.s = b.dataset.s;
  st.sort = null;
  document.querySelectorAll("[data-s]").forEach((x) => { x.classList.toggle("is-on", x === b); x.setAttribute("aria-selected", String(x === b)); });
  document.querySelectorAll("[data-sort]").forEach((x) => x.classList.remove("is-on"));
  render();
}));
document.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => {
  if (st.sort === b.dataset.sort) st.dir *= -1; else { st.sort = b.dataset.sort; st.dir = -1; }
  document.querySelectorAll("[data-sort]").forEach((x) => x.classList.toggle("is-on", x === b));
  document.querySelectorAll("[data-s]").forEach((x) => { x.classList.remove("is-on"); x.setAttribute("aria-selected", "false"); });
  render();
}));
document.querySelectorAll("[data-t]").forEach((b) => b.addEventListener("click", () => {
  st.t = b.dataset.t;
  st.more = false;
  document.querySelectorAll("[data-t]").forEach((x) => x.classList.toggle("is-on", x === b));
  render();
}));
$("[data-search]").addEventListener("input", (e) => { st.q = e.target.value.trim(); render(); });
moreBtn.addEventListener("click", () => { st.more = true; render(); });

const paintChain = () => document.querySelectorAll("[data-ch]").forEach((b) => { const on = b.dataset.ch === st.ch; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", String(on)); });
paintChain();
document.querySelectorAll("[data-ch]").forEach((b) => b.addEventListener("click", () => {
  st.ch = b.dataset.ch;
  st.more = false;
  paintChain();
  const u = new URL(location.href);
  if (st.ch === "all") u.searchParams.delete("chain"); else u.searchParams.set("chain", st.ch);
  history.replaceState(null, "", u);
  render();
}));

// GeckoTerminal: PumpSwap pool open time (graduation) and Solana-side 24h volume, one request for all pools.
// Graduation times never change, so they are kept in the browser; volumes refresh every 10 minutes.
const SOL_KEY = "ge-grad-sol", AT_KEY = "ge-grad-sol-at";
// Storage can be blocked (private mode, some preview hosts): touching it at all must stay inside try.
const readJ = (where, k) => { try { return JSON.parse(window[where].getItem(k) || "null"); } catch { return null; } };
const saveJ = (where, k, v) => { try { window[where].setItem(k, JSON.stringify(v)); } catch {} };
async function loadSol(coins) {
  const pairs = coins.filter(isSolGrad).map((c) => c.pair).filter(Boolean);
  if (!pairs.length) return;
  const ats = readJ("localStorage", AT_KEY) || {};
  const hit = readJ("sessionStorage", SOL_KEY);
  const d = {};
  for (const p of pairs) d[p] = { at: ats[p] || null, v: hit && hit.d[p] ? hit.d[p].v : null };
  st.sol = d;
  if (hit && Date.now() - hit.t < 10 * 6e4 && pairs.every((p) => hit.d[p])) return;
  try {
    const r = await fetch("https://api.geckoterminal.com/api/v2/networks/solana/pools/multi/" + pairs.slice(0, 30).join(","), { headers: { accept: "application/json" } });
    if (!r.ok) return;
    const j = await r.json();
    for (const p of j.data || []) {
      const a = p.attributes || {};
      if (!a.address) continue;
      const at = a.pool_created_at ? Date.parse(a.pool_created_at) : null;
      d[a.address] = { at: at || ats[a.address] || null, v: a.volume_usd && a.volume_usd.h24 != null ? Number(a.volume_usd.h24) : null };
      if (at) ats[a.address] = at;
    }
    st.sol = { ...d };
    saveJ("localStorage", AT_KEY, ats);
    saveJ("sessionStorage", SOL_KEY, { t: Date.now(), d });
  } catch {
    // Rate-limited or offline: rows still show, just without the Solana time and volume.
  } finally {
    st.solTried = true;
  }
}

rowsEl.innerHTML = Array.from({ length: 8 }, () => `<tr><td colspan="9"><div class="skel-block" style="min-height:36px"></div></td></tr>`).join("");

async function load() {
  try {
    const j = await getApi("/tokens");
    st.data = j;
    notice.hidden = true;
    loadSol(j.coins || []).catch(() => {}).then(() => { st.solTried = true; render(); });
    liveStatus({ updatedAt: new Date(j.updatedAt), sources: { snek: { on: (j.coins || []).some((c) => c.src === "snek") } } });
    render();
  } catch (e) {
    liveStatus(null, e);
    if (!st.data) {
      notice.hidden = false;
      notice.innerHTML = "<strong>Can't reach the Gator Eyes feed right now.</strong> It will retry in a minute.";
      rowsEl.innerHTML = "";
    }
  }
}
load();
setInterval(load, 60000);

// Graduated coins: every coin that left the Solada.fun or Snek.fun bonding curve
// for a regular pool, with when it graduated, how long it took and how it trades now.
import { getApi, price, pct, signed, span } from "./api.js?v=20261102-statcard";
import { coinUrl } from "./data.js?v=20261102-statcard";
import { esc, fmt, compact, timeAgo } from "./ui.js?v=20261102-statcard";
import { wireLinks, liveStatus } from "./common.js?v=20261102-statcard";
import * as platform from "./platform.js?v=20261102-statcard";
import * as watchlist from "./watchlist.js?v=20261102-statcard";
import { pill } from "./platform.js?v=20261102-statcard";
import { starBtn } from "./watchlist.js?v=20261102-statcard";

wireLinks();
platform.mount();
watchlist.wire();
platform.on(() => { st.more = false; render(); });

const $ = (s) => document.querySelector(s);
const rowsEl = $("[data-rows]"), moreBtn = $("[data-more]"), notice = $("[data-notice]");
const params = new URLSearchParams(location.search);
const WHEN = { all: Infinity, d1: 864e5, d7: 7 * 864e5, d30: 30 * 864e5 };
const st = { s: "recent", sort: null, dir: -1, t: WHEN[params.get("t")] ? params.get("t") : "all", q: (params.get("q") || "").trim(), more: false, data: null };
document.querySelectorAll("[data-t]").forEach((x) => x.classList.toggle("is-on", x.dataset.t === st.t));
if (st.q) $("[data-search]").value = st.q;

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
    <td><div class="coin-cell">${img}<div><a href="${esc(coinUrl(c.id))}" target="_blank" rel="noopener">${esc(c.tk || "?")}</a>${showPill && c.src === "snek" ? pill("snek") : ""}<span class="cell-sub">${esc((c.name || "").slice(0, 22))}</span></div></div></td>
    <td class="grad-cell">${gradCell(c)}</td>
    <td class="num">${compact(c.mc)}<span class="cell-sub">${c.price != null ? esc(price(c.price)) : ""}</span></td>
    <td class="num hide-sm">${c.hold != null ? fmt(c.hold) : "–"}</td>
    <td class="num">${fmt(w.v)}<span class="cell-sub">${fmt(w.n)} trades</span></td>
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
  const latest = timed.sort((a, b) => b.gAt - a.gAt)[0];
  const counts = { solada: all.filter((c) => c.src !== "snek").length, snek: all.filter((c) => c.src === "snek").length };
  const scope = platform.get();
  const split = scope === "all" ? `${fmt(counts.solada)} Solada · ${fmt(counts.snek)} Snek.fun` : "being tracked";
  return [
    ["Graduated", fmt(all.length), split],
    ["This week", fmt(week.length), latest ? "latest: " + (latest.tk || "") + ", " + timeAgo(latest.gAt) : "none with a time"],
    ["Typical time", median != null ? span(median) : "–", tooks.length ? `launch to graduation, median of ${tooks.length}` : "no graduation times"],
    ["24h volume", fmt(vol) + " ADA", `net flow ${signed(net)} ADA`],
  ].map(([l, v, s]) => `<div class="kpi"><span class="kpi-label">${esc(l)}</span><span class="kpi-value">${esc(v)}</span><span class="kpi-sub">${esc(s)}</span></div>`).join("");
}

function render() {
  const d = st.data;
  if (!d) return;
  const now = Date.now();
  const grads = (d.coins || []).filter((c) => c.cs === "graduated" && platform.inScope(c));
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
  const emptyMsg = q ? `No graduated coin matches "${esc(st.q)}".` : st.t !== "all" ? "No coins graduated in this window." : "No graduated coins on this launchpad right now.";
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

rowsEl.innerHTML = Array.from({ length: 8 }, () => `<tr><td colspan="9"><div class="skel-block" style="min-height:36px"></div></td></tr>`).join("");

async function load() {
  try {
    const j = await getApi("/tokens");
    st.data = j;
    notice.hidden = true;
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

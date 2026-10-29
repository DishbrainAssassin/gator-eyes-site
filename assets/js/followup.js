// Alert follow-up: what each alert's coin did 1 hour and 24 hours later.
import { getApi, price, pct } from "./api.js?v=20261029h";
import { coinUrl } from "./data.js?v=20261029h";
import { esc, fmt, timeAgo } from "./ui.js?v=20261029h";
import { wireLinks, liveStatus } from "./common.js?v=20261029h";

wireLinks();
const $ = (s) => document.querySelector(s);
const TYPES = {
  bigbuy: { label: "Whale buy", color: "var(--color-buy)", test: (a) => a.kind === "big" && a.side === "buy" },
  bigsell: { label: "Whale sell", color: "var(--color-sell)", test: (a) => a.kind === "big" && a.side === "sell" },
  spike: { label: "Volume spike", color: "var(--color-spike)", test: (a) => a.kind === "spike" },
  launch: { label: "Fast launch", color: "var(--color-launch)", test: (a) => a.kind === "launch" },
  dev: { label: "Creator sell", color: "var(--color-amber)", test: (a) => a.kind === "dev" },
};
const typeOf = (a) => Object.keys(TYPES).find((k) => TYPES[k].test(a));
const params = new URLSearchParams(location.search);
const st = { days: 7, k: "", q: params.get("coin") || "", more: false, list: [], imgs: {}, updatedAt: null };
if (st.q) $("[data-search]").value = st.q;

const chg = (a, b) => (a && b ? (b / a - 1) * 100 : null);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const when = (ms) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

function inPeriod(a) { return !st.days || a.at >= Date.now() - st.days * 864e5; }

function later(a, key, ms) {
  const v = a[key];
  if (v != null) { const c = chg(a.p0, v); return `<span class="${c > 0.05 ? "pos" : c < -0.05 ? "neg" : ""}">${pct(c)}</span>`; }
  const due = a.at + ms - Date.now();
  if (due > 0) return `<span class="pending">in ${due > 36e5 ? Math.round(due / 36e5) + " hr" : Math.max(1, Math.round(due / 6e4)) + " min"}</span>`;
  return `<span class="pending">–</span>`;
}

function summary() {
  const base = st.list.filter(inPeriod);
  $("[data-sum]").innerHTML = Object.entries(TYPES).map(([k, t]) => {
    const xs = base.filter((a) => typeOf(a) === k);
    const one = xs.filter((a) => a.p1 != null).map((a) => chg(a.p0, a.p1));
    const day = xs.filter((a) => a.p24 != null).map((a) => chg(a.p0, a.p24));
    const up1 = one.filter((c) => c > 0.05).length;
    const up24 = day.filter((c) => c > 0.05).length;
    return `<div class="fu-card" style="--k:${t.color}">
      <h3>${esc(t.label)}s</h3>
      <span class="big">${fmt(xs.length)}</span>
      <dl>
        <dt>Higher 1h later</dt><dd>${one.length ? `${up1} of ${one.length}` : "–"}</dd>
        <dt>Typical 1h move</dt><dd>${pct(median(one))}</dd>
        <dt>Higher 24h later</dt><dd>${day.length ? `${up24} of ${day.length}` : "–"}</dd>
        <dt>Typical 24h move</dt><dd>${pct(median(day))}</dd>
      </dl>
    </div>`;
  }).join("");
}

function render() {
  summary();
  const q = st.q.toLowerCase();
  const list = st.list.filter((a) => inPeriod(a) && (!st.k || typeOf(a) === st.k) && (!q || (a.tk || "").toLowerCase().includes(q) || a.id.toLowerCase() === q)).sort((a, b) => b.at - a.at);
  const shown = st.more ? list : list.slice(0, 100);
  $("[data-rows]").innerHTML = shown.length ? shown.map((a) => {
    const t = TYPES[typeOf(a)] || { label: a.kind, color: "var(--color-text-muted)" };
    const im = st.imgs[a.id] ? `<img src="${esc(st.imgs[a.id])}" alt="" loading="lazy" width="28" height="28">` : `<span class="coin-dot"></span>`;
    return `<tr>
      <td><span class="cell-sub" style="font-size:var(--text-xs)">${esc(when(a.at))}</span></td>
      <td><div class="coin-cell">${im}<a href="${esc(coinUrl(a.id))}" target="_blank" rel="noopener">${esc(a.tk || "?")}</a></div></td>
      <td><span class="badge-k" style="--k:${t.color}">${esc(t.label)}</span></td>
      <td class="num hide-sm">${a.ada != null ? fmt(a.ada) + " ADA" : "–"}</td>
      <td class="num hide-sm">${price(a.p0)}</td>
      <td class="num">${later(a, "p1", 36e5)}</td>
      <td class="num">${later(a, "p24", 864e5)}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="7"><div class="empty"><p>No alerts match.</p></div></td></tr>`;
  $("[data-more]").hidden = st.more || list.length <= 100;
  $("[data-more]").textContent = `Show all ${list.length}`;
  $("[data-updated]").textContent = st.updatedAt ? "Updated " + timeAgo(st.updatedAt) + "." : "";
}

document.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => {
  st.days = Number(b.dataset.p);
  document.querySelectorAll("[data-p]").forEach((x) => x.classList.toggle("is-on", x === b));
  render();
}));
document.querySelectorAll("[data-k]").forEach((b) => b.addEventListener("click", () => {
  st.k = b.dataset.k;
  document.querySelectorAll("[data-k]").forEach((x) => x.classList.toggle("is-on", x === b));
  render();
}));
$("[data-search]").addEventListener("input", (e) => { st.q = e.target.value.trim(); render(); });
$("[data-more]").addEventListener("click", () => { st.more = true; render(); });
$("[data-rows]").innerHTML = Array.from({ length: 8 }, () => `<tr><td colspan="7"><div class="skel-block" style="min-height:32px"></div></td></tr>`).join("");

const toObj = (r) => ({ at: r[0], kind: r[1], id: r[2], tk: r[3], side: r[4], ada: r[5], p0: r[6], p1: r[7], p24: r[8] });

async function load() {
  let rows = [], imgs = {}, at = null;
  try {
    const j = await getApi("/followup");
    rows = j.alerts || []; imgs = j.imgs || {}; at = j.updatedAt ? Date.parse(j.updatedAt) : null;
    liveStatus({ updatedAt: new Date(at || Date.now()) });
  } catch (e) { liveStatus(null, e); }
  if (!rows.length) {
    // Until the worker has its own copy, fall back to the saved history.
    try { const h = await (await fetch("./assets/data/alert-history.json", { cache: "no-store" })).json(); rows = h.alerts || []; at = at || h.builtAt; } catch {}
  }
  if (!rows.length && !st.list.length) { const n = $("[data-notice]"); n.hidden = false; n.innerHTML = "<strong>Can't load the alert history right now.</strong> It will retry in a minute."; $("[data-rows]").innerHTML = ""; return; }
  $("[data-notice]").hidden = true;
  st.list = rows.map(toObj).filter((a) => a.p0);
  st.imgs = { ...st.imgs, ...imgs };
  st.updatedAt = at;
  render();
}
load();
setInterval(load, 120000);

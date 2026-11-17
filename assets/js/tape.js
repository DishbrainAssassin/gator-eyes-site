// Live trade tape: a stock-ticker strip pinned inside the sticky header on every page. Reads the last
// 40 trades from /feed (both launchpads), newest first, and scrolls them sideways.
// Pauses on hover and focus. With reduced motion it becomes a plain side-scrolling row.
//
// Layout choice (added 2026-11-16): Top (default), Left or Right, remembered on this device in
// localStorage `ge-tape-layout`. Left/Right turn the strip into a column down that side of the page that
// shows the full trade feed (every size, up to 300, from the worker's /trade-feed) and scrolls upward
// instead of sideways. Each trade shows the same details as the top strip. Side layouts need a wide
// screen (>= 1100px); narrower screens and the installed app always use the top strip.
import { CONFIG } from "./config.js?v=20261102-usdcx2";
import { subscribe } from "./data.js?v=20261102-usdcx2";
import * as platform from "./platform.js?v=20261102-usdcx2";
import { fmt, esc, usdcxShort } from "./ui.js?v=20261102-usdcx2";

let rate = null;

const PX_PER_SEC = 55; // scroll speed (both directions)
const TOP_N = 40; // the top strip keeps showing the newest 40
const FULL_MAX = 300; // the side column's full feed
const DAY_MS = 24 * 3600e3;
const LAYOUT_KEY = "ge-tape-layout";
const LAYOUTS = ["top", "left", "right"];
const SIDE_MQ = "(min-width: 1100px)";
const CSS_HREF = "./assets/css/tape-side.css?v=20261116-side";

let host, track, view, header, lastKey = "", items = [], fullOk = null, fullTimer = null, paused = false;
let layout = "top";
let raf = 0, lastTs = 0, yPos = 0;

function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return s + "s";
  const m = Math.round(s / 60);
  if (m < 60) return m + "m";
  return Math.round(m / 60) + "h";
}

function item(t) {
  const tk = t.tk || (t.id || "").replace(/^draft-/, "").replace(/^snek:/, "").slice(0, 10);
  const buy = t.side === "buy";
  const img = t.img ? `<img src="${esc(t.img)}" alt="" width="16" height="16" loading="lazy" onerror="this.remove()">` : "";
  const lp = t.src === "snek" ? `<i class="tape-lp lp-snek" title="Snek.fun"></i>` : "";
  const ada = t.ada >= 1000 ? fmt(t.ada) : fmt(t.ada, t.ada < 10 ? 2 : 0);
  return `<a class="tape-item ${buy ? "is-buy" : "is-sell"}" href="./tokens.html?q=${encodeURIComponent(tk)}" title="${buy ? "Bought" : "Sold"} ${fmt(t.ada, 2)} ADA${rate ? " (" + usdcxShort(t.ada, rate) + ")" : ""} of $${esc(tk)} ${esc(ago(t.at))} ago${t.src === "snek" ? " on Snek.fun" : ""}">${lp}${img}<b>$${esc(tk)}</b><span class="tape-side">${buy ? "▲" : "▼"} ${ada} ADA${rate ? `<em class="tape-usd">${usdcxShort(t.ada, rate)}</em>` : ""}</span><small>${esc(ago(t.at))}</small></a>`;
}

// ---------- layout ----------

const inApp = () => document.documentElement.classList.contains("is-app") || matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const sideAllowed = () => matchMedia(SIDE_MQ).matches && !inApp();
const isSide = () => layout !== "top" && sideAllowed();

function savedLayout() {
  try { const v = localStorage.getItem(LAYOUT_KEY); return LAYOUTS.includes(v) ? v : "top"; } catch { return "top"; }
}
function saveLayout(v) {
  try { localStorage.setItem(LAYOUT_KEY, v); } catch {}
}

let cssReady = null;
function loadCss() {
  if (cssReady) return cssReady;
  cssReady = new Promise((ok) => {
    if (document.querySelector('link[data-tape-css]')) return ok();
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = CSS_HREF;
    l.dataset.tapeCss = "";
    l.onload = l.onerror = () => ok();
    document.head.appendChild(l);
  });
  return cssReady;
}

const ICONS = {
  top: `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="none" stroke="currentColor"/><rect x="2.5" y="2.5" width="11" height="3" fill="currentColor"/></svg>`,
  left: `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="none" stroke="currentColor"/><rect x="2.5" y="2.5" width="3.5" height="11" fill="currentColor"/></svg>`,
  right: `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="none" stroke="currentColor"/><rect x="10" y="2.5" width="3.5" height="11" fill="currentColor"/></svg>`,
};
const LAYOUT_LABEL = { top: "Ticker across the top", left: "Full trade feed down the left side", right: "Full trade feed down the right side" };

function paintLayoutButtons() {
  if (!host) return;
  const allowed = sideAllowed();
  host.querySelectorAll("[data-tape-layout]").forEach((b) => {
    const v = b.dataset.tapeLayout;
    const on = (isSide() ? layout : "top") === v;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", String(on));
    b.hidden = !allowed; // on narrow screens and in the app only the top strip exists, so hide the chooser
  });
  const seg = host.querySelector(".tape-layouts");
  if (seg) seg.hidden = !allowed;
}

function trackHeader() {
  if (!header) return;
  const set = () => document.documentElement.style.setProperty("--ge-hdr-h", header.getBoundingClientRect().height + "px");
  set();
  if ("ResizeObserver" in window) new ResizeObserver(set).observe(header);
  else addEventListener("resize", set);
}

async function applyLayout() {
  const side = isSide();
  const root = document.documentElement;
  if (side) await loadCss();
  host.classList.toggle("tape--side", side);
  host.setAttribute("aria-label", side ? "Live trade feed" : "Live trade tape");
  host.querySelector(".tape-label").lastChild.textContent = side ? "Live trades" : "Live";
  if (side) {
    if (host.parentElement !== document.body) document.body.appendChild(host);
    root.dataset.tapeSide = layout;
  } else {
    if (host.parentElement !== header) header.appendChild(host); // inside the sticky header, so it stays at the top while scrolling
    delete root.dataset.tapeSide;
  }
  paintLayoutButtons();
  syncToggle();
  lastKey = ""; // force a fresh render in the new shape
  render();
  if (side) startFull(); else stopFull();
}

// ---------- full feed (side column) ----------

const tradeFeedUrl = () => {
  const p = new URLSearchParams(location.search).get("tradefeed");
  return p || CONFIG.tradeFeedUrl || CONFIG.feedUrl.replace(/\/feed(\?.*)?$/, "/trade-feed");
};
const tkey = (t) => t.at + "|" + t.id + "|" + t.side + "|" + t.ada;

function merge(list) {
  if (!Array.isArray(list) || !list.length) return;
  const seen = new Set(items.map(tkey));
  let added = false;
  for (const t of list) {
    if (!t || !t.at) continue;
    const k = tkey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    items.push(t);
    added = true;
  }
  if (!added) return;
  const cut = Date.now() - DAY_MS;
  items = items.filter((t) => t.at >= cut).sort((a, b) => b.at - a.at).slice(0, FULL_MAX);
}

async function loadFull() {
  if (fullOk === false || document.visibilityState !== "visible") return;
  try {
    const u = new URL(tradeFeedUrl(), location.href);
    if (!/\.json$/.test(u.pathname)) u.searchParams.set("n", String(FULL_MAX));
    const r = await fetch(u, { cache: "no-store" });
    if (r.status === 404 || r.status === 400) { fullOk = false; return; } // worker without /trade-feed yet: build up from /feed instead
    if (!r.ok) return;
    const j = await r.json();
    if (j && Array.isArray(j.trades)) { fullOk = true; merge(j.trades); render(); }
  } catch {}
}
function startFull() {
  loadFull();
  if (!fullTimer) fullTimer = setInterval(() => { if (isSide()) loadFull(); }, CONFIG.refreshMs || 60000);
}
function stopFull() {
  if (fullTimer) { clearInterval(fullTimer); fullTimer = null; }
}

// ---------- render ----------

function render() {
  if (!track) return;
  const side = isSide();
  const scoped = items.filter((t) => platform.inScope(t));
  const rows = side ? scoped : scoped.slice(0, TOP_N);
  if (!rows.length) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const key = (side ? "S|" : "T|") + rows.map(tkey).join(",") + "|" + platform.get();
  if (key === lastKey) {
    // Same trades: only refresh the ages so the strip doesn't jump.
    track.querySelectorAll(".tape-set").forEach((set) => {
      set.querySelectorAll(".tape-item").forEach((el, i) => {
        const t = rows[i];
        const s = el.querySelector("small");
        if (s && t) s.textContent = ago(t.at);
      });
    });
    return;
  }
  const prevKey = lastKey;
  lastKey = key;
  const html = rows.map(item).join("");
  if (side) {
    renderSide(rows, html, prevKey);
    return;
  }
  stopSideScroll();
  track.style.transform = "";
  track.innerHTML = `<div class="tape-set">${html}</div><div class="tape-set" aria-hidden="true" inert>${html}</div>`;
  // Speed scales with content so short and long strips move at the same pace.
  requestAnimationFrame(() => {
    const w = track.firstElementChild ? track.firstElementChild.scrollWidth : 0;
    track.style.setProperty("--tape-dur", Math.max(20, Math.round(w / PX_PER_SEC)) + "s");
  });
}

// Side column: newest at the top, the column drifts upward like the top strip drifts left. New trades
// slide in above without yanking the reader's place: the scroll offset grows by the height they add.
function renderSide(rows, html, prevKey) {
  const firstOld = track.querySelector(".tape-set .tape-item");
  const oldTopKey = prevKey.startsWith("S|") && firstOld ? firstOld.dataset.k : null;
  const rowsHtml = rows.map((t) => item(t).replace("<a ", `<a data-k="${esc(tkey(t))}" `)).join("");
  track.innerHTML = `<div class="tape-set">${rowsHtml}</div><div class="tape-set" aria-hidden="true" inert>${rowsHtml}</div>`;
  let added = 0;
  if (oldTopKey) {
    const idx = rows.findIndex((t) => tkey(t) === oldTopKey);
    const el = idx > 0 ? track.firstElementChild.children[idx] : null;
    if (el) added = el.offsetTop; // height of the new rows above the old first row
  } else {
    yPos = 0;
    if (view) view.scrollTop = 0;
  }
  // Paused or reduced motion: the column is a plain scrollable list; keep the reader on the same trade.
  if (manualMode()) {
    track.style.transform = "";
    if (added && view && view.scrollTop > 0) view.scrollTop += added;
    return;
  }
  if (added && yPos > 0) yPos += added;
  const h = track.firstElementChild.offsetHeight;
  if (h && yPos >= h) yPos = yPos % h;
  track.style.transform = `translateY(${-yPos}px)`;
  startSideScroll();
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const manualMode = () => paused || reduced();
const hovering = () => host && (host.matches(":hover") || host.matches(":focus-within"));

function step(ts) {
  raf = requestAnimationFrame(step);
  if (!lastTs) { lastTs = ts; return; }
  const dt = Math.min(0.1, (ts - lastTs) / 1000);
  lastTs = ts;
  if (!isSide() || manualMode() || hovering() || document.visibilityState !== "visible") return;
  const set = track.firstElementChild;
  const h = set ? set.offsetHeight : 0;
  if (!h || h <= view.clientHeight) { yPos = 0; track.style.transform = ""; return; } // fits: nothing to scroll
  yPos += PX_PER_SEC * dt;
  if (yPos >= h) yPos -= h; // the second copy makes the loop seamless, like the top strip
  track.style.transform = `translateY(${-yPos}px)`;
}
function startSideScroll() {
  if (raf || manualMode()) return;
  lastTs = 0;
  raf = requestAnimationFrame(step);
}
function stopSideScroll() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

function syncToggle() {
  const toggle = host.querySelector(".tape-toggle");
  host.classList.toggle("is-paused", paused);
  toggle.textContent = paused ? "Resume" : "Pause";
  const what = isSide() ? "trade feed" : "trade ticker";
  toggle.setAttribute("aria-label", (paused ? "Resume " : "Pause ") + what);
  toggle.setAttribute("aria-pressed", String(paused));
  if (!isSide()) return;
  // Side column: pausing turns it into a list you can scroll yourself, starting where it stopped.
  if (manualMode()) {
    stopSideScroll();
    const set = track.firstElementChild;
    const h = set ? set.offsetHeight : 0;
    track.style.transform = "";
    host.classList.add("is-manual");
    if (view) view.scrollTop = h ? yPos % h : 0;
  } else {
    host.classList.remove("is-manual");
    if (view) { yPos = view.scrollTop || yPos; view.scrollTop = 0; }
    track.style.transform = `translateY(${-yPos}px)`;
    startSideScroll();
  }
}

export function mountTape() {
  header = document.querySelector(".site-header");
  if (!header || document.querySelector(".tape")) return;
  layout = savedLayout();
  host = document.createElement("div");
  host.className = "tape";
  host.hidden = true;
  host.setAttribute("role", "region");
  host.setAttribute("aria-label", "Live trade tape");
  const seg = LAYOUTS.map((v) => `<button type="button" class="tape-layout" data-tape-layout="${v}" aria-pressed="false" aria-label="${LAYOUT_LABEL[v]}" title="${LAYOUT_LABEL[v]}">${ICONS[v]}</button>`).join("");
  host.innerHTML = `<div class="tape-label"><span class="live-dot is-live" aria-hidden="true"></span>Live</div><div class="tape-view"><div class="tape-track"></div></div><div class="tape-layouts" role="group" aria-label="Ticker position" hidden>${seg}</div><button type="button" class="tape-toggle" aria-label="Pause trade ticker" aria-pressed="false">Pause</button>`;
  header.appendChild(host);
  track = host.querySelector(".tape-track");
  view = host.querySelector(".tape-view");
  trackHeader();
  // The layout chooser is styled in tape-side.css; load it whenever the chooser can show.
  if (sideAllowed()) loadCss();
  host.querySelector(".tape-toggle").addEventListener("click", () => {
    paused = !paused;
    syncToggle();
  });
  host.querySelectorAll("[data-tape-layout]").forEach((b) => b.addEventListener("click", () => {
    const v = b.dataset.tapeLayout;
    if (v === layout && (v === "top" || isSide())) return;
    layout = v;
    saveLayout(v);
    yPos = 0;
    applyLayout();
  }));
  const mq = matchMedia(SIDE_MQ);
  const onMq = () => { if (sideAllowed()) loadCss(); applyLayout(); };
  if (mq.addEventListener) mq.addEventListener("change", onMq); else if (mq.addListener) mq.addListener(onMq);
  subscribe((feed) => {
    if (!feed) return;
    rate = feed.rate || null;
    merge(Array.isArray(feed.tape) ? feed.tape : []);
    render();
  });
  platform.on(() => { yPos = 0; render(); });
  setInterval(() => render(), 30000);
  applyLayout();
}

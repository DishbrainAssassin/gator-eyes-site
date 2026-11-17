// Live trade tape: a stock-ticker strip pinned inside the sticky header on every page. Reads the last
// 40 trades from /feed (both launchpads), newest first, and scrolls them sideways.
// Pauses on hover and focus. With reduced motion it becomes a plain side-scrolling row.
//
// Layout choice (added 2026-11-16): Top (default), Left or Right, remembered on this device in
// localStorage `ge-tape-layout`. Left/Right turn the strip into a column down that side of the page that
// shows the full trade feed (every size, up to 300, from the worker's /trade-feed) as a live feed: newest
// at the top, new trades slide in and push older ones down. It does not loop. Each trade shows the same details as the top strip. Side layouts need a wide
// screen (>= 1100px); narrower screens and the installed app always use the top strip.
// A ?tape=left|right|top link sets the layout too (added 2026-11-16 for the About page link).
// On the top strip, a "Full live feed" button beside LIVE opens the right-side column (wide screens only).
//
// Watchlist filter (added 2026-11-16): the star button narrows either layout to trades on coins starred
// on this device (the website watchlist, watchlist.js). Remembered in localStorage `ge-tape-filter`.
// While it's on, the top strip also reads /trade-feed so it can find starred-coin trades older than
// the newest 40.
import { CONFIG } from "./config.js?v=20261102-usdcx2";
import { subscribe } from "./data.js?v=20261102-usdcx2";
import * as platform from "./platform.js?v=20261102-usdcx2";
import { fmt, esc, usdcxShort } from "./ui.js?v=20261102-usdcx2";
import * as watchlist from "./watchlist.js?v=20261102-usdcx2";

let rate = null;

const PX_PER_SEC = 55; // scroll speed (both directions)
const TOP_N = 40; // the top strip keeps showing the newest 40
const FULL_MAX = 300; // the side column's full feed
const DAY_MS = 24 * 3600e3;
const LAYOUT_KEY = "ge-tape-layout";
const LAYOUTS = ["top", "left", "right"];
const SIDE_MQ = "(min-width: 1100px)";
const CSS_HREF = "./assets/css/tape-side.css?v=20261116-expand";
const FILTER_KEY = "ge-tape-filter";

let host, track, view, header, lastKey = "", items = [], fullOk = null, fullTimer = null, paused = false;
let layout = "top";
let watchOnly = false;
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
function savedFilter() {
  try { return localStorage.getItem(FILTER_KEY) === "watch"; } catch { return false; }
}
function saveFilter(on) {
  try { if (on) localStorage.setItem(FILTER_KEY, "watch"); else localStorage.removeItem(FILTER_KEY); } catch {}
}
const needFull = () => isSide() || watchOnly;

function paintWatch() {
  const b = host && host.querySelector(".tape-watch");
  if (!b) return;
  b.classList.toggle("is-on", watchOnly);
  b.setAttribute("aria-pressed", String(watchOnly));
  const n = watchlist.count();
  b.title = watchOnly ? "Showing trades on your starred coins only. Click to show all trades." : n ? `Show only trades on your ${n} starred coin${n === 1 ? "" : "s"}` : "Show only trades on your starred coins (star coins on Tokens or Watchlist first)";
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
  // Top strip on a wide screen: a "Full live feed" button beside LIVE so people find the side column.
  const ex = host.querySelector(".tape-expand");
  if (ex) ex.hidden = !allowed || isSide();
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
  if (needFull()) startFull(); else stopFull();
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
// Side column polls fast so trades land within seconds; it eases off when nobody's touched the page
// for a few minutes and stops while the tab is hidden. Horizontal (watchlist) mode keeps the slow pace.
const LIVE_POLL_MS = 5000, IDLE_POLL_MS = 20000, IDLE_AFTER_MS = 180000;
let lastActive = Date.now();
const pollMs = () => !isSide() ? (CONFIG.refreshMs || 60000) : (Date.now() - lastActive > IDLE_AFTER_MS ? IDLE_POLL_MS : LIVE_POLL_MS);
let pollGen = 0;
function tickFull(gen = pollGen) {
  fullTimer = setTimeout(async () => {
    if (gen !== pollGen) return;
    if (!needFull()) { fullTimer = null; return; }
    await loadFull();
    if (gen === pollGen) tickFull(gen);
  }, pollMs());
}
function startFull() {
  loadFull();
  if (!fullTimer) tickFull();
}
function stopFull() {
  pollGen++;
  if (fullTimer) { clearTimeout(fullTimer); fullTimer = null; }
}
function wake() {
  const wasIdle = Date.now() - lastActive > IDLE_AFTER_MS;
  lastActive = Date.now();
  if (wasIdle && fullTimer && isSide()) { stopFull(); startFull(); } // back from idle: catch up now
}
["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"].forEach((e) => addEventListener(e, wake, { passive: true, capture: true }));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") { stopFull(); return; }
  lastActive = Date.now();
  if (needFull()) startFull();
});

// ---------- render ----------

function render() {
  if (!track) return;
  const side = isSide();
  const mine = watchOnly ? new Set(watchlist.ids()) : null;
  const scoped = items.filter((t) => platform.inScope(t) && (!mine || mine.has(t.id)));
  const rows = side ? scoped : scoped.slice(0, TOP_N);
  if (!rows.length) {
    if (!watchOnly) {
      host.hidden = true;
      return;
    }
    // Watchlist filter with nothing to show: keep the bar so the filter can be switched back off.
    host.hidden = false;
    stopSideScroll();
    track.style.transform = "";
    const msg = watchlist.count()
      ? (!items.length ? "Loading trades…" : "No trades on your starred coins in the last 24 hours" + (platform.get() === "all" ? "." : " on " + platform.label(platform.get()) + "."))
      : `No starred coins yet. Star coins on <a href="./tokens.html">Tokens</a> to follow their trades here.`;
    const key = "E|" + msg + "|" + (side ? "S" : "T");
    if (key === lastKey) return;
    lastKey = key;
    track.innerHTML = `<div class="tape-set"><p class="tape-empty">${msg}</p></div>`;
    return;
  }
  host.hidden = false;
  const key = (side ? "S|" : "T|") + rows.map(tkey).join(",") + "|" + platform.get();
  if (key === lastKey && side) { renderSide(rows, lastKey); return; } // side column refreshes ages by trade, not position
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
    renderSide(rows, prevKey);
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

// Side column: a live feed, like the Discord #trade-feed channel. Newest trade at the top; each new trade
// slides in above and pushes the older ones down and, eventually, off the bottom. It doesn't loop back
// through older trades. The column polls every few seconds; a batch is let in one trade at a time, oldest
// first, spread over the next few seconds. Every row keeps its real age.
// Hover or Pause holds new trades back (they queue and come in on resume); if you've scrolled down to
// read older trades, your place is kept while new ones land above.
let shown = []; // trades in the column, newest first
let queue = []; // trades waiting to slide in, oldest first
let sideCtx = "";
let pumpT = 0, gap = 1500;
const BATCH_SPREAD_MS = 4500; // about one poll, so the column never falls behind

const sideItem = (t) => item(t).replace("<a ", `<a data-k="${esc(tkey(t))}" `);

function renderSide(rows, prevKey) {
  stopSideScroll();
  track.style.transform = "";
  const ctx = (watchOnly ? "W:" + watchlist.ids().join(",") : "A") + "|" + platform.get();
  let set = track.querySelector(".tape-set");
  const fresh = ctx !== sideCtx || !set || !prevKey.startsWith("S|") || !shown.length;
  if (fresh) {
    sideCtx = ctx;
    queue = [];
    clearTimeout(pumpT); pumpT = 0;
    shown = rows.slice();
    track.innerHTML = `<div class="tape-set">${shown.map(sideItem).join("")}</div>`;
    if (view) view.scrollTop = 0;
    return;
  }
  const topAt = shown[0].at;
  const have = new Set(shown.map(tkey).concat(queue.map(tkey)));
  const incoming = rows.filter((t) => t.at >= topAt && !have.has(tkey(t)));
  if (incoming.length) {
    queue = queue.concat(incoming).sort((a, b) => a.at - b.at);
    gap = Math.max(250, Math.min(1200, Math.round(BATCH_SPREAD_MS / queue.length)));
  }
  // Older trades that dropped out (past 24 hours or the 300 cap) leave; older ones that arrived late
  // (e.g. the full list loading after the first 40) are filled in below without animation.
  const queued = new Set(queue.map(tkey));
  const target = rows.filter((t) => !queued.has(tkey(t)) && (t.at < topAt || have.has(tkey(t))));
  const same = target.length === shown.length && target.every((t, i) => tkey(t) === tkey(shown[i]));
  if (!same) {
    const keepTop = view ? view.scrollTop : 0;
    shown = target;
    set.innerHTML = shown.map(sideItem).join("");
    if (view) view.scrollTop = keepTop;
  } else {
    const at = new Map(shown.map((t) => [tkey(t), t.at]));
    set.querySelectorAll(".tape-item").forEach((el) => { const s = el.querySelector("small"); const a = at.get(el.dataset.k); if (s && a) s.textContent = ago(a); });
  }
  pump();
}

function pump() {
  if (pumpT || !queue.length) return;
  pumpT = setTimeout(() => {
    pumpT = 0;
    if (!isSide() || !queue.length) return;
    if (paused || hovering() || document.visibilityState !== "visible") { pump(); return; } // hold, check again shortly
    const t = queue.shift();
    const set = track.querySelector(".tape-set");
    if (!set) return;
    const tpl = document.createElement("template");
    tpl.innerHTML = sideItem(t);
    const el = tpl.content.firstElementChild;
    const reading = view && view.scrollTop > 4;
    if (!reduced() && !reading) el.classList.add("is-new");
    set.prepend(el);
    shown.unshift(t);
    if (reading) view.scrollTop += el.offsetHeight; // keep the reader's place
    while (shown.length > FULL_MAX) { shown.pop(); if (set.lastElementChild) set.lastElementChild.remove(); }
    lastKey = "S|" + shown.map(tkey).join(",") + "|" + platform.get();
    pump();
  }, queue.length ? gap : 1000);
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// Hold new trades while the pointer is over the column or keyboard focus is in the list (not the buttons,
// or clicking Resume would keep holding them).
const hovering = () => host && (host.matches(":hover") || !!(view && view.matches(":focus-within")));
// The side column no longer drifts; these stay as no-ops for the layout code.
function startSideScroll() {}
function stopSideScroll() {}

function syncToggle() {
  const toggle = host.querySelector(".tape-toggle");
  host.classList.toggle("is-paused", paused);
  toggle.textContent = paused ? "Resume" : "Pause";
  const what = isSide() ? "trade feed" : "trade ticker";
  toggle.setAttribute("aria-label", (paused ? "Resume " : "Pause ") + what);
  toggle.setAttribute("aria-pressed", String(paused));
  if (!isSide()) return;
  // Side column: always a list you can scroll; Pause just holds new trades back until Resume.
  host.classList.add("is-manual");
  if (!paused) pump();
}

export function mountTape() {
  header = document.querySelector(".site-header");
  if (!header || document.querySelector(".tape")) return;
  layout = savedLayout();
  // ?tape=left|right|top (e.g. the About page's "Full trade feed" link) picks the layout and remembers it.
  // Only switches to a side column where one is allowed; phones and the installed app keep the top strip.
  const want = new URLSearchParams(location.search).get("tape");
  if (LAYOUTS.includes(want) && (want === "top" || sideAllowed())) { layout = want; saveLayout(want); }
  host = document.createElement("div");
  host.className = "tape";
  host.hidden = true;
  host.setAttribute("role", "region");
  host.setAttribute("aria-label", "Live trade tape");
  const seg = LAYOUTS.map((v) => `<button type="button" class="tape-layout" data-tape-layout="${v}" aria-pressed="false" aria-label="${LAYOUT_LABEL[v]}" title="${LAYOUT_LABEL[v]}">${ICONS[v]}</button>`).join("");
  const star = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6l1.9 4 4.4.5-3.3 3 .9 4.3L8 11.2l-3.9 2.2.9-4.3-3.3-3 4.4-.5z" fill="currentColor"/></svg>`;
  host.innerHTML = `<div class="tape-label"><span class="live-dot is-live" aria-hidden="true"></span>Live</div><button type="button" class="tape-expand" hidden title="Open the full live trade feed down the side of the page: every trade, any size, newest first">Full live feed <span aria-hidden="true">›</span></button><div class="tape-view"><div class="tape-track"></div></div><button type="button" class="tape-watch" aria-pressed="false" aria-label="Watchlist only">${star}<span>Watchlist</span></button><div class="tape-layouts" role="group" aria-label="Ticker position" hidden>${seg}</div><button type="button" class="tape-toggle" aria-label="Pause trade ticker" aria-pressed="false">Pause</button>`;
  header.appendChild(host);
  track = host.querySelector(".tape-track");
  view = host.querySelector(".tape-view");
  trackHeader();
  // The watchlist button and layout chooser are styled in tape-side.css.
  loadCss();
  watchOnly = savedFilter();
  paintWatch();
  host.querySelector(".tape-watch").addEventListener("click", () => {
    watchOnly = !watchOnly;
    saveFilter(watchOnly);
    paintWatch();
    yPos = 0;
    if (view) view.scrollTop = 0;
    lastKey = "";
    render();
    if (needFull()) startFull(); else stopFull();
  });
  // Starring or un-starring a coin anywhere on the page updates the filtered ticker straight away.
  watchlist.on(() => { paintWatch(); if (watchOnly) { lastKey = ""; render(); } });
  host.querySelector(".tape-toggle").addEventListener("click", () => {
    paused = !paused;
    syncToggle();
  });
  host.querySelector(".tape-expand").addEventListener("click", () => {
    if (!sideAllowed()) return;
    layout = "right";
    saveLayout("right");
    applyLayout();
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
  const onMq = () => applyLayout();
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

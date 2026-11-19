// Embeddable live-flows box. Use ?coin=<Solada coin id> for one coin, or leave it
// off for all of Solada. Add &theme=light for light backgrounds.
//
// Live trades (2026-11-18): the list under the totals is the same live trade feed as the site's side
// column (tape.js): every trade, any size, from the worker's /trade-feed (both launchpads, or just the
// chosen coin). Newest at the top; new trades slide in and push older ones down, no looping. Hover holds
// new trades back; scrolling down to read keeps your place. Polls every 5s while the widget is on screen,
// 20s after 3 minutes with no pointer activity on it, and stops while it's off screen or the tab is hidden.
import { CONFIG } from "./config.js?v=20261102-usdcx2";
import { subscribe, setFeedParams } from "./data.js?v=20261102-usdcx2";
import { esc, fmt, compact, timeAgo, KINDS, usdcx, usdcxSigned, usdcxShort } from "./ui.js?v=20261102-usdcx2";

const p = new URLSearchParams(location.search);
const coinId = (p.get("coin") || "").trim();
if (p.get("theme") === "light") document.documentElement.classList.add("light");
setFeedParams({ coin: coinId });

const $ = (s) => document.querySelector(s);
const short = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "k" : fmt(n));
const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + short(Math.abs(n));
const home = new URL("./flows.html", location.href);
$("[data-home]").href = home.toString();

function pick(f) {
  const d = f.today;
  if (!coinId) {
    if (!d) return null;
    return { title: "Solada today", sub: "All coins, midnight to now ET", v: d.volAda, b: d.buyAda, s: d.sellAda, net: d.buyAda - d.sellAda, n: d.trades, img: null };
  }
  const c = f.coin && f.coin.id === coinId ? f.coin : d && (d.coins || []).find((k) => k.id === coinId);
  const tk = (c && c.tk) || coinId.replace(/^draft-/, "").toUpperCase();
  if (!c || !c.n) return { title: `$${tk} today`, sub: "No trades yet today", v: 0, b: 0, s: 0, net: 0, n: 0, img: c && c.img };
  const b = c.b != null ? c.b : Math.max(0, (c.v + c.net) / 2);
  return { title: `$${tk} today`, sub: "On Solada, midnight to now ET", v: c.v, b, s: c.v - b, net: c.net, n: c.n, img: c.img };
}

function render(f, err) {
  if (!f) {
    $("[data-sub]").textContent = err ? "Live feed reconnecting" : "Loading live flows";
    return;
  }
  const fresh = f.updatedAt && Date.now() - f.updatedAt.getTime() < 15 * 60000;
  $("[data-dot]").classList.toggle("live", !!fresh);
  $("[data-updated]").textContent = f.updatedAt ? (fresh ? "Updated " : "Solada paused · ") + timeAgo(f.updatedAt.getTime()) : "";
  const x = pick(f);
  if (!x) return;
  $("[data-title]").textContent = x.title;
  $("[data-sub]").textContent = x.sub;
  $("[data-img]").innerHTML = x.img ? `<img src="${esc(x.img)}" alt="" onerror="this.remove()">` : "";
  $("[data-kpis]").innerHTML = [
    ["Volume", short(x.v) + " ADA", "", x.v ? usdcx(x.v, f.rate) : ""],
    ["Net flow", signed(x.net) + " ADA", x.net > 0 ? "pos" : x.net < 0 ? "neg" : "", x.net ? usdcxSigned(x.net, f.rate) : ""],
    ["Trades", fmt(x.n), "", ""],
  ].map(([l, v, c, u]) => `<div class="w-kpi"><span>${l}</span><b class="${c}">${v}</b>${u ? `<small>${u}</small>` : ""}</div>`).join("");
  const hasSplit = x.v > 0;
  $("[data-split]").hidden = $("[data-legend]").hidden = !hasSplit;
  if (hasSplit) {
    $("[data-split] .b").style.width = (x.b / x.v) * 100 + "%";
    $("[data-legend]").innerHTML = `<span class="pos">Bought ${compact(x.b)}${f.rate ? ` <small>${usdcxShort(x.b, f.rate)}</small>` : ""}</span><span class="neg">Sold ${compact(x.s)}${f.rate ? ` <small>${usdcxShort(x.s, f.rate)}</small>` : ""}</span>`;
  }
  const hadRate = rate;
  rate = f.rate || rate;
  if (!hadRate && rate && shown.length) { const keep = viewEl.scrollTop; listEl.innerHTML = shown.map(row).join(""); viewEl.scrollTop = keep; } // add USDCx once the rate is known
  mergeTrades(Array.isArray(f.tape) ? f.tape : []);
}

subscribe(render);

// ---------- live trades (same feed and flow as the site's side column) ----------

const FULL_MAX = 300, KEEP = 100, DAY_MS = 24 * 3600e3;
const LIVE_POLL_MS = 5000, IDLE_POLL_MS = 20000, IDLE_AFTER_MS = 180000, BATCH_SPREAD_MS = 4500;
const listEl = $("[data-trades]");
const viewEl = $("[data-trades-view]");
let rate = null, items = [], shown = [], queue = [], pumpT = 0, gap = 1500, fullOk = null, timer = null, gen = 0;
let onScreen = true, lastActive = Date.now();
$("[data-live-sub]").textContent = coinId ? " · every trade, any size" : " · Solada + Snek.fun, any size";

const tradeFeedUrl = () => new URLSearchParams(location.search).get("tradefeed") || CONFIG.tradeFeedUrl || CONFIG.feedUrl.replace(/\/feed(\?.*)?$/, "/trade-feed");
const tkey = (t) => t.at + "|" + t.id + "|" + t.side + "|" + t.ada;
const mine = (t) => !coinId || t.id === coinId;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const holding = () => document.body.matches(":hover") || !!(viewEl && viewEl.matches(":focus-within"));

function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return s + "s";
  const m = Math.round(s / 60);
  return m < 60 ? m + "m" : Math.round(m / 60) + "h";
}

// Same details as the site's trade rows: launchpad mark, coin image, ticker, side, ADA, USDCx, age.
function row(t) {
  const tk = t.tk || (t.id || "").replace(/^draft-/, "").replace(/^snek:/, "").slice(0, 10);
  const buy = t.side === "buy";
  const img = t.img ? `<img src="${esc(t.img)}" alt="" width="16" height="16" loading="lazy" onerror="this.outerHTML='<i class=w-noimg></i>'">` : `<i class="w-noimg"></i>`;
  const lp = t.src === "snek" ? `<i class="w-lp" title="Snek.fun"></i>` : "";
  const ada = t.ada >= 1000 ? fmt(t.ada) : fmt(t.ada, t.ada < 10 ? 2 : 0);
  const usd = rate ? usdcxShort(t.ada, rate) : "";
  const href = new URL("./tokens.html?q=" + encodeURIComponent(tk), location.href);
  const tip = `${buy ? "Bought" : "Sold"} ${fmt(t.ada, 2)} ADA${usd ? " (" + usd + ")" : ""} of $${tk} ${ago(t.at)} ago${t.src === "snek" ? " on Snek.fun" : ""}`;
  return `<li><a class="w-trade ${buy ? "is-buy" : "is-sell"}" data-k="${esc(tkey(t))}" href="${esc(href.toString())}" target="_blank" rel="noopener" title="${esc(tip)}">${lp}${img}<b>$${esc(tk)}</b><span class="w-amt">${buy ? "▲" : "▼"} ${ada} ADA${usd ? `<em>${esc(usd)}</em>` : ""}</span><small>${esc(ago(t.at))}</small></a></li>`;
}

function mergeTrades(list) {
  if (Array.isArray(list) && list.length) {
    const seen = new Set(items.map(tkey));
    for (const t of list) {
      if (!t || !t.at || !mine(t)) continue;
      const k = tkey(t);
      if (!seen.has(k)) { seen.add(k); items.push(t); }
    }
    const cut = Date.now() - DAY_MS;
    items = items.filter((t) => t.at >= cut).sort((a, b) => b.at - a.at).slice(0, KEEP);
  }
  paint();
}

function paint() {
  if (!items.length) {
    if (!shown.length) listEl.innerHTML = `<li class="empty">${fullOk === null ? "Loading trades…" : "No trades" + (coinId ? " for this coin" : "") + " in the last 24 hours."}</li>`;
    return;
  }
  if (!shown.length) {
    shown = items.slice();
    listEl.innerHTML = shown.map(row).join("");
    return;
  }
  const topAt = shown[0].at;
  const have = new Set(shown.map(tkey).concat(queue.map(tkey)));
  const incoming = items.filter((t) => t.at >= topAt && !have.has(tkey(t)));
  if (incoming.length) {
    queue = queue.concat(incoming).sort((a, b) => a.at - b.at);
    gap = Math.max(250, Math.min(1200, Math.round(BATCH_SPREAD_MS / queue.length)));
  }
  // Trades older than the top that showed up late fill in below without animation; 24h-old ones leave.
  const queued = new Set(queue.map(tkey));
  const target = items.filter((t) => !queued.has(tkey(t)) && (t.at < topAt || have.has(tkey(t))));
  const same = target.length === shown.length && target.every((t, i) => tkey(t) === tkey(shown[i]));
  if (!same) {
    const keep = viewEl.scrollTop;
    shown = target;
    listEl.innerHTML = shown.map(row).join("");
    viewEl.scrollTop = keep;
  } else {
    const at = new Map(shown.map((t) => [tkey(t), t.at]));
    listEl.querySelectorAll(".w-trade").forEach((el) => { const s = el.querySelector("small"); const a = at.get(el.dataset.k); if (s && a) s.textContent = ago(a); });
  }
  pump();
}

function pump() {
  if (pumpT || !queue.length) return;
  pumpT = setTimeout(() => {
    pumpT = 0;
    if (!queue.length) return;
    if (holding() || document.visibilityState !== "visible") { pump(); return; } // hold, check again shortly
    const t = queue.shift();
    const tpl = document.createElement("template");
    tpl.innerHTML = row(t);
    const el = tpl.content.firstElementChild;
    const reading = viewEl.scrollTop > 4;
    if (!reduced() && !reading) el.classList.add("is-new");
    listEl.querySelector(".empty")?.remove();
    listEl.prepend(el);
    shown.unshift(t);
    if (reading) viewEl.scrollTop += el.offsetHeight; // keep the reader's place
    while (shown.length > KEEP) { shown.pop(); listEl.lastElementChild?.remove(); }
    pump();
  }, gap);
}

async function loadFull() {
  if (fullOk === false || document.visibilityState !== "visible" || !onScreen) return;
  try {
    const u = new URL(tradeFeedUrl(), location.href);
    if (!/\.json$/.test(u.pathname)) u.searchParams.set("n", String(FULL_MAX));
    const r = await fetch(u, { cache: "no-store" });
    if (r.status === 404 || r.status === 400) { fullOk = false; paint(); return; } // fall back to /feed's tape
    if (!r.ok) return;
    const j = await r.json();
    if (j && Array.isArray(j.trades)) { fullOk = true; mergeTrades(j.trades); }
  } catch {}
}

const pollMs = () => (Date.now() - lastActive > IDLE_AFTER_MS ? IDLE_POLL_MS : LIVE_POLL_MS);
const running = () => document.visibilityState === "visible" && onScreen && fullOk !== false;
function tick(g) {
  timer = setTimeout(async () => {
    if (g !== gen) return;
    await loadFull();
    if (g === gen && running()) tick(g); else timer = null;
  }, pollMs());
}
function start() { stop(); if (!running()) return; loadFull(); tick(gen); }
function stop() { gen++; if (timer) { clearTimeout(timer); timer = null; } }

["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"].forEach((e) =>
  addEventListener(e, () => { const idle = Date.now() - lastActive > IDLE_AFTER_MS; lastActive = Date.now(); if (idle) start(); }, { passive: true, capture: true }));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { lastActive = Date.now(); start(); } else stop(); });
// Off screen on the host page (scrolled away): stop asking for trades until it's back in view.
if ("IntersectionObserver" in window) {
  new IntersectionObserver((es) => {
    const v = es.some((e) => e.isIntersecting);
    if (v === onScreen) return;
    onScreen = v;
    if (v) { lastActive = Date.now(); start(); } else stop();
  }).observe(document.querySelector(".w"));
}
setInterval(paint, 30000); // keep ages fresh in quiet markets
start();

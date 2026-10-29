// Coin share card: one coin's last 24 hours on Solada.fun as a 1200x675 PNG.
import { getApi, price, pct, signed, hours, span } from "./api.js?v=20261029f";
import { coinUrl } from "./data.js?v=20261029f";
import { esc, fmt, compact, timeAgo } from "./ui.js?v=20261029f";
import { wireLinks, liveStatus } from "./common.js?v=20261029f";

wireLinks();
const $ = (s) => document.querySelector(s);
const canvas = $("[data-card]");
const ctx = canvas.getContext("2d");
const W = 1200, H = 675, P = 56;
const C = { bg: "#06090a", panel: "#0c1112", line: "#1e2a2b", text: "#e4e2db", muted: "#9aa29d", faint: "#5f6b67", amber: "#e3a43c", buy: "#6fbf73", sell: "#e0705f" };
const F = { d: '"Cabinet Grotesk", "Helvetica Neue", sans-serif', b: '"Satoshi", "Helvetica Neue", sans-serif', m: '"JetBrains Mono", ui-monospace, monospace' };
const AL = { big: "whale", spike: "volume spike", launch: "fast launch", dev: "creator sell" };

const avatar = new Image();
avatar.src = "./assets/img/avatar-256.webp";
const ready = Promise.all([
  document.fonts.load(`800 72px ${F.d}`), document.fonts.load(`700 20px ${F.d}`),
  document.fonts.load(`500 18px ${F.b}`), document.fonts.load(`700 18px ${F.b}`), document.fonts.load(`500 18px ${F.m}`),
  new Promise((r) => (avatar.complete ? r() : ((avatar.onload = r), (avatar.onerror = r)))),
]).catch(() => {});

let data = null, coin = null, series = [], art = null, tainted = false;

function text(s, x, y, { font, color = C.text, align = "left", spacing = 0 } = {}) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) ctx.letterSpacing = spacing + "px";
  ctx.fillText(s, x, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  return ctx.measureText(s).width;
}
function fit(s, maxW, font) {
  ctx.font = font;
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}
function rrect(x, y, w, h, r, fill, stroke) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
function loadImg(src) {
  return new Promise((res) => {
    if (!src) return res(null);
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
    setTimeout(() => res(null), 6000);
  });
}
// Make sure the coin image doesn't block the download (some hosts send no CORS headers).
function safeImage(im) {
  if (!im) return null;
  try { const t = document.createElement("canvas"); t.width = t.height = 2; const x = t.getContext("2d"); x.drawImage(im, 0, 0, 2, 2); x.getImageData(0, 0, 1, 1); return im; } catch { return null; }
}

function draw() {
  const c = coin, w = c.w.h24 || { v: 0, n: 0, b: 0, s: 0, net: 0, wal: 0, ch: null };
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W * 0.85, -60, 10, W * 0.85, -60, 520);
  g.addColorStop(0, "rgba(227,164,60,0.14)"); g.addColorStop(1, "rgba(227,164,60,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  if (avatar.naturalWidth) { ctx.save(); ctx.beginPath(); ctx.arc(P + 22, 62, 22, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(avatar, P, 40, 44, 44); ctx.restore(); }
  text("GATOR EYES", P + 60, 70, { font: `800 20px ${F.d}`, color: C.amber, spacing: 4 });
  const now = new Date();
  text("Last 24 hours on Solada.fun", W - P, 62, { font: `700 20px ${F.b}`, align: "right" });
  text(now.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET", W - P, 86, { font: `500 15px ${F.b}`, color: C.muted, align: "right" });

  // coin identity
  const iy = 118, is = 96;
  if (art) { ctx.save(); rrect(P, iy, is, is, 18); ctx.clip(); ctx.drawImage(art, P, iy, is, is); ctx.restore(); rrect(P, iy, is, is, 18, null, C.line); }
  else { rrect(P, iy, is, is, 18, C.panel, C.line); text((c.tk || "?").slice(0, 2), P + is / 2, iy + 62, { font: `800 38px ${F.d}`, color: C.amber, align: "center" }); }
  const tx = P + is + 24;
  text(fit(c.tk || "?", 520, `800 64px ${F.d}`), tx, iy + 58, { font: `800 64px ${F.d}` });
  text(fit(c.name || "", 520, `500 20px ${F.b}`), tx, iy + 90, { font: `500 20px ${F.b}`, color: C.muted });
  text(price(c.price) + " ADA", W - P, iy + 50, { font: `500 40px ${F.m}`, align: "right" });
  const chCol = w.ch > 0 ? C.buy : w.ch < 0 ? C.sell : C.muted;
  text((w.ch != null ? pct(w.ch) : "–") + " in 24h", W - P, iy + 86, { font: `700 20px ${F.b}`, color: chCol, align: "right" });

  // KPI row
  const ky = 246, kh = 78, kw = (W - 2 * P - 3 * 12) / 4;
  const kpis = [
    ["Traded", compact(w.v) + " ADA", C.text, data.adaUsd ? `~${fmt(w.v * data.adaUsd)} USDCx` : ""],
    ["Net flow", signed(w.net) + " ADA", w.net > 0 ? C.buy : w.net < 0 ? C.sell : C.text, `${compact(w.b)} in · ${compact(w.s)} out`],
    ["Trades", fmt(w.n), C.text, `${fmt(w.wal)} wallets`],
    ["Market cap", c.mc ? compact(c.mc) + " ADA" : "–", C.text, c.hold ? `${fmt(c.hold)} holders` : ""],
  ];
  kpis.forEach(([l, v, col, sub], i) => {
    const x = P + i * (kw + 12);
    rrect(x, ky, kw, kh + 14, 10, C.panel, C.line);
    text(l, x + 16, ky + 26, { font: `500 14px ${F.b}`, color: C.muted });
    text(fit(v, kw - 32, `500 22px ${F.m}`), x + 16, ky + 58, { font: `500 22px ${F.m}`, color: col });
    if (sub) text(fit(sub, kw - 32, `500 13px ${F.b}`), x + 16, ky + 80, { font: `500 13px ${F.b}`, color: C.faint });
  });

  // price line
  const cx = P, cy = 352, cw = 700, ch = 222;
  rrect(cx, cy, cw, ch, 12, C.panel, C.line);
  text("Price, last 24 hours", cx + 18, cy + 30, { font: `700 15px ${F.b}` });
  const pts = series.filter((s) => s[1] > 0);
  if (pts.length >= 2) {
    const t0 = Date.now() - 864e5, t1 = Date.now();
    const lo = Math.min(...pts.map((s) => s[1])), hi = Math.max(...pts.map((s) => s[1]));
    const px = (t) => cx + 18 + ((t - t0) / (t1 - t0)) * (cw - 36);
    const py = (p) => cy + ch - 34 - (hi > lo ? (p - lo) / (hi - lo) : 0.5) * (ch - 84);
    const col = pts[pts.length - 1][1] >= pts[0][1] ? C.buy : C.sell;
    ctx.beginPath();
    pts.forEach((s, i) => (i ? ctx.lineTo(px(s[0]), py(s[1])) : ctx.moveTo(px(Math.max(t0, s[0])), py(s[1]))));
    ctx.lineTo(px(t1), py(pts[pts.length - 1][1]));
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.stroke();
    ctx.lineTo(px(t1), cy + ch - 34); ctx.lineTo(px(Math.max(t0, pts[0][0])), cy + ch - 34); ctx.closePath();
    const fg = ctx.createLinearGradient(0, cy + 40, 0, cy + ch - 34);
    fg.addColorStop(0, col === C.buy ? "rgba(111,191,115,0.22)" : "rgba(224,112,95,0.22)"); fg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fg; ctx.fill();
    text("High " + price(hi), cx + cw - 18, cy + 30, { font: `500 13px ${F.m}`, color: C.muted, align: "right" });
    text("24h ago", cx + 18, cy + ch - 12, { font: `500 12px ${F.m}`, color: C.faint });
    text("now", cx + cw - 18, cy + ch - 12, { font: `500 12px ${F.m}`, color: C.faint, align: "right" });
  } else {
    text("Not enough trades in the last 24 hours to draw a line.", cx + 18, cy + 120, { font: `500 15px ${F.b}`, color: C.muted });
  }

  // right panel: curve and alerts
  const rx = cx + cw + 24, rw = W - P - rx;
  rrect(rx, cy, rw, ch, 12, C.panel, C.line);
  let y = cy + 30;
  if (c.cs === "open" && c.prog != null) {
    const p = Math.min(100, c.prog / 100);
    text("Graduation", rx + 18, y, { font: `700 15px ${F.b}` });
    text(p.toFixed(1) + "%", rx + rw - 18, y, { font: `500 15px ${F.m}`, color: C.amber, align: "right" });
    rrect(rx + 18, y + 14, rw - 36, 12, 6, C.line);
    rrect(rx + 18, y + 14, Math.max(8, ((rw - 36) * p) / 100), 12, 6, C.amber);
    const pc = c.pace || {};
    text(fit(`${fmt(pc.need)} ADA to go · ${pc.etaH != null ? hours(pc.etaH) + " at this pace" : "not moving closer"}`, rw - 36, `500 14px ${F.b}`), rx + 18, y + 50, { font: `500 14px ${F.b}`, color: C.muted });
    y += 86;
  } else if (c.cs === "graduated") {
    text("Graduated to Minswap", rx + 18, y, { font: `700 15px ${F.b}` });
    if (c.gAt) text(fit(c.born ? `Took ${span(c.gAt - c.born)} from launch` : "", rw - 36, `500 14px ${F.b}`), rx + 18, y + 26, { font: `500 14px ${F.b}`, color: C.muted });
    y += 62;
  }
  text("Gator Eyes alerts, 24h", rx + 18, y, { font: `700 15px ${F.b}` });
  const al = Object.entries(c.al || {});
  if (!al.length) text("None", rx + 18, y + 28, { font: `500 14px ${F.b}`, color: C.muted });
  al.slice(0, 3).forEach(([k, n], i) => text(`${n} ${AL[k] || k}${n > 1 ? " alerts" : " alert"}`, rx + 18, y + 28 + i * 24, { font: `500 14px ${F.b}`, color: C.muted }));

  ctx.fillStyle = C.line; ctx.fillRect(P, H - 70, W - 2 * P, 1);
  text("Lurking so you don't have to", P, H - 32, { font: `800 18px ${F.d}` });
  text("gatoreyes.fun  ·  @GatorEyesSolada  ·  Not financial advice", W - P, H - 32, { font: `500 14px ${F.b}`, color: C.muted, align: "right" });
}

function caption() {
  const c = coin, w = c.w.h24 || {};
  const link = coinUrl(c.slug || c.id);
  const bits = [`$${c.tk} on Solada.fun, last 24 hours`, `${fmt(w.v || 0)} ADA traded by ${fmt(w.wal || 0)} wallets. Net flow ${signed(w.net || 0)} ADA. Price ${w.ch != null ? pct(w.ch) : "flat"}.`];
  if (c.cs === "open" && c.prog != null) bits.push(`${(c.prog / 100).toFixed(0)}% of the way to graduating.`);
  bits.push(link);
  return bits.join("\n");
}

function resolve(s) {
  s = (s || "").trim().replace(/^\$/, "");
  const m = s.match(/solada\.fun\/(?:coin|token|c)\/([A-Za-z0-9_-]+)/i);
  if (m) s = m[1];
  const l = s.toLowerCase();
  return data.coins.find((c) => (c.tk || "").toLowerCase() === l) || data.coins.find((c) => c.id === s || c.slug === s);
}

async function show(s) {
  const n = $("[data-notice]");
  const c = resolve(s);
  if (!c) { n.hidden = false; n.innerHTML = "<strong>Coin not found.</strong> Pick one from the list, or paste its Solada.fun link."; return; }
  n.hidden = true;
  coin = c;
  $("[data-coin]").value = c.tk || c.id;
  const u = new URL(location.href); u.searchParams.set("coin", c.id); history.replaceState(null, "", u);
  const [im] = await Promise.all([loadImg(c.img), loadSeries(c)]);
  if (coin !== c) return;
  art = safeImage(im);
  await ready;
  draw();
  const cap = caption();
  $("[data-caption-preview]").textContent = cap;
  const dl = $("[data-download]"), cp = $("[data-copy-caption]");
  dl.disabled = cp.disabled = false;
  dl.onclick = () => {
    const a = document.createElement("a");
    a.download = `gator-eyes-${(c.tk || c.id).replace(/[^A-Za-z0-9_-]/g, "")}.png`;
    try { a.href = canvas.toDataURL("image/png"); a.click(); } catch { n.hidden = false; n.innerHTML = "<strong>This coin's image blocks downloads.</strong> Right-click the card and save it instead."; }
  };
  cp.onclick = async () => {
    try { await navigator.clipboard.writeText(cap); cp.textContent = "Copied"; } catch { cp.textContent = "Select and copy below"; }
    setTimeout(() => (cp.textContent = "Copy caption"), 1600);
  };
}

async function loadSeries(c) {
  series = [];
  if (c.id === "SOLADA") return;
  const from = Date.now() - 864e5;
  let before = "", list = [];
  try {
    for (let i = 0; i < 6; i++) {
      const j = await getApi("/coin-trades", { coin: c.slug || c.id, before });
      list.push(...j.trades);
      const last = j.trades[j.trades.length - 1];
      if (!j.more || !last || last.at < from) break;
      before = last.at;
    }
  } catch {}
  // Solada coins use 6 decimals, so price per token = ADA / (raw tokens / 1e6).
  const pts = list.filter((t) => t.tokens && t.ada).map((t) => [t.at, t.ada / (Number(t.tokens) / 1e6)]).sort((a, b) => a[0] - b[0]);
  const before24 = pts.filter((p) => p[0] < from).pop();
  series = [...(before24 ? [[from, before24[1]]] : []), ...pts.filter((p) => p[0] >= from)];
}

$("[data-pick]").addEventListener("submit", (e) => { e.preventDefault(); show($("[data-coin]").value); });

async function init() {
  try {
    data = await getApi("/tokens");
    liveStatus({ updatedAt: new Date(data.updatedAt) });
  } catch (e) {
    liveStatus(null, e);
    const n = $("[data-notice]"); n.hidden = false; n.innerHTML = "<strong>Can't reach the Gator Eyes feed right now.</strong> Try again in a minute.";
    return;
  }
  const seen = new Set();
  $("[data-list]").innerHTML = data.coins.filter((c) => c.tk && !seen.has(c.tk) && seen.add(c.tk)).map((c) => `<option value="${esc(c.tk)}">${esc(c.name || "")}</option>`).join("");
  const pre = new URLSearchParams(location.search).get("coin");
  const def = pre || ([...data.coins].sort((a, b) => ((b.w.h24 || {}).v || 0) - ((a.w.h24 || {}).v || 0))[0] || {}).id;
  if (def) show(def);
}
init();
void timeAgo;

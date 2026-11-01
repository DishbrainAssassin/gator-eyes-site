// Coin share card: one coin's last 24 hours on Solada.fun or Snek.fun as a 1200x675 PNG.
import { getApi, price, pct, signed, hours, span } from "./api.js?v=20261101-sol2";
import { coinUrl, fetchFeed } from "./data.js?v=20261101-sol2";
import { esc, fmt, compact, timeAgo } from "./ui.js?v=20261101-sol2";
import { wireLinks, liveStatus } from "./common.js?v=20261101-sol2";
import * as platform from "./platform.js?v=20261101-sol2";

wireLinks();
platform.mount();
platform.on(() => fillList());
const siteOf = (c) => (c && c.src === "snek" ? "Snek.fun" : "Solada.fun");
const linkOf = (c) => coinUrl(c.src === "snek" ? c.id : c.slug || c.id);
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

let data = null, coin = null, series = [], art = null, tainted = false, sol = null;

// Solana side: Solada coins that also trade on Pump.fun/PumpSwap (kind "pump") can trade in SOL or USDC,
// which the ADA tracker can't see. For those, the card uses DexScreener's 24h totals and GeckoTerminal's
// hourly prices for the busiest Solana pool. Any error just leaves the card on the ADA numbers.
// The Solana mint comes from the worker (Solada publishes it); older lists only had it when the slug happened to be the mint.
const solMint = (c) => c && (c.mint || (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(c.slug || "") ? c.slug : null)) || null;
const isSolSide = (c) => c && c.kind === "pump" && !((c.w.h24 || {}).n) && !!solMint(c);
const DEX = { pumpswap: "PumpSwap", pumpfun: "Pump.fun", raydium: "Raydium", meteora: "Meteora", orca: "Orca" };
async function loadSol(c) {
  if (!isSolSide(c)) return null;
  try {
    const mint = solMint(c);
    const r = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + mint);
    const j = r.ok ? await r.json() : null;
    const ps = ((j && j.pairs) || []).filter((x) => x.chainId === "solana" && x.baseToken && x.baseToken.address === mint)
      .sort((x, y) => ((y.volume && y.volume.h24) || 0) - ((x.volume && x.volume.h24) || 0));
    const pr = ps[0];
    if (!pr) return null;
    const t = (pr.txns && pr.txns.h24) || {}, vUsd = (pr.volume && pr.volume.h24) || 0;
    return { pair: pr.pairAddress, b: t.buys || 0, s: t.sells || 0, vUsd, vAda: data.adaUsd ? vUsd / data.adaUsd : null,
      ch: pr.priceChange ? pr.priceChange.h24 : null, dex: DEX[pr.dexId] || pr.dexId, quote: (pr.quoteToken && pr.quoteToken.symbol) || "SOL",
      priceUsd: Number(pr.priceUsd) || null, url: pr.url || null };
  } catch { return null; }
}
// Hourly closes for the Solana pool, turned into ADA so the line matches the ADA price on the card.
async function loadSolSeries(sw) {
  if (!sw || !sw.pair || !data.adaUsd) return [];
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${sw.pair}/ohlcv/hour?aggregate=1&limit=48`);
    const j = r.ok ? await r.json() : null;
    const l = ((j && j.data && j.data.attributes && j.data.attributes.ohlcv_list) || []).map((k) => [k[0] * 1000, k[4] / data.adaUsd]).sort((a, b) => a[0] - b[0]);
    const from = Date.now() - 864e5, prev = l.filter((p) => p[0] < from).pop();
    const out = [...(prev ? [[from, prev[1]]] : []), ...l.filter((p) => p[0] >= from)];
    if (out.length && sw.priceUsd) out.push([Date.now(), sw.priceUsd / data.adaUsd]);
    return out;
  } catch { return []; }
}
const usd = (n) => "$" + (n >= 100 ? Math.round(n).toLocaleString("en-US") : n.toFixed(2));

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
  text(sol ? "Last 24 hours on Solana · " + sol.dex : "Last 24 hours on " + siteOf(c), W - P, 62, { font: `700 20px ${F.b}`, align: "right" });
  text(now.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET", W - P, 86, { font: `500 15px ${F.b}`, color: C.muted, align: "right" });

  // coin identity
  const iy = 118, is = 96;
  if (art) { ctx.save(); rrect(P, iy, is, is, 18); ctx.clip(); ctx.drawImage(art, P, iy, is, is); ctx.restore(); rrect(P, iy, is, is, 18, null, C.line); }
  else { rrect(P, iy, is, is, 18, C.panel, C.line); text((c.tk || "?").slice(0, 2), P + is / 2, iy + 62, { font: `800 38px ${F.d}`, color: C.amber, align: "center" }); }
  const tx = P + is + 24;
  text(fit(c.tk || "?", 520, `800 64px ${F.d}`), tx, iy + 58, { font: `800 64px ${F.d}` });
  text(fit(c.name || "", 520, `500 20px ${F.b}`), tx, iy + 90, { font: `500 20px ${F.b}`, color: C.muted });
  text(price(c.price) + " ADA", W - P, iy + 50, { font: `500 40px ${F.m}`, align: "right" });
  const chg = w.ch != null ? w.ch : sol && sol.ch != null ? sol.ch : null;
  const chCol = chg > 0 ? C.buy : chg < 0 ? C.sell : C.muted;
  text((chg != null ? pct(chg) : "–") + " in 24h", W - P, iy + 86, { font: `700 20px ${F.b}`, color: chCol, align: "right" });

  // KPI row
  const ky = 246, kh = 78, kw = (W - 2 * P - 3 * 12) / 4;
  const kpis = sol ? [
    ["Traded", usd(sol.vUsd), C.text, sol.vAda ? `~${fmt(sol.vAda)} ADA` : ""],
    ["Buys / sells", `${fmt(sol.b)} / ${fmt(sol.s)}`, sol.b > sol.s ? C.buy : sol.b < sol.s ? C.sell : C.text, "by number of trades"],
    ["Trades", fmt(sol.b + sol.s), C.text, `${sol.dex} · ${sol.quote} pair`],
    ["Market cap", c.mc ? compact(c.mc) + " ADA" : "–", C.text, c.hold ? `${fmt(c.hold)} holders` : ""],
  ] : [
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
    const up = sol && sol.ch != null ? sol.ch >= 0 : pts[pts.length - 1][1] >= pts[0][1];
    const col = up ? C.buy : C.sell;
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
    text(c.src === "snek" ? "Graduated to Splash" : "Graduated to Minswap", rx + 18, y, { font: `700 15px ${F.b}` });
    if (c.gAt) text(fit(c.born ? `Took ${span(c.gAt - c.born)} from launch` : "", rw - 36, `500 14px ${F.b}`), rx + 18, y + 26, { font: `500 14px ${F.b}`, color: C.muted });
    y += 62;
  } else if (c.cs === "open" && c.src === "snek") {
    // Snek.fun doesn't publish curve progress, so just say where the coin is.
    text("On the Snek.fun bonding curve", rx + 18, y, { font: `700 15px ${F.b}` });
    text(fit(c.born ? `Launched ${span(Date.now() - c.born)} ago` : "", rw - 36, `500 14px ${F.b}`), rx + 18, y + 26, { font: `500 14px ${F.b}`, color: C.muted });
    y += 62;
  }
  text("Gator Eyes alerts, 24h", rx + 18, y, { font: `700 15px ${F.b}` });
  const al = Object.entries(c.al || {});
  if (!al.length) text("None", rx + 18, y + 28, { font: `500 14px ${F.b}`, color: C.muted });
  al.slice(0, 3).forEach(([k, n], i) => text(`${n} ${AL[k] || k}${n > 1 ? " alerts" : " alert"}`, rx + 18, y + 28 + i * 24, { font: `500 14px ${F.b}`, color: C.muted }));

  if (sol) text(fit("Solana data: DexScreener, GeckoTerminal", rw - 36, `500 12px ${F.b}`), rx + 18, cy + ch - 16, { font: `500 12px ${F.b}`, color: C.faint });
  ctx.fillStyle = C.line; ctx.fillRect(P, H - 70, W - 2 * P, 1);
  text("Lurking so you don't have to", P, H - 32, { font: `800 18px ${F.d}` });
  text("gatoreyes.fun  ·  @GatorEyesADA  ·  Not financial advice", W - P, H - 32, { font: `500 14px ${F.b}`, color: C.muted, align: "right" });
}

function caption() {
  const c = coin, w = c.w.h24 || {};
  const link = linkOf(c);
  if (sol) {
    const chg = sol.ch != null ? pct(sol.ch) : "flat";
    return [`$${c.tk} on Solana (${sol.dex}), last 24 hours`, `${fmt(sol.b + sol.s)} trades: ${fmt(sol.b)} buys, ${fmt(sol.s)} sells. About ${usd(sol.vUsd)} traded${sol.vAda ? ` (~${fmt(sol.vAda)} ADA)` : ""}. Price ${chg}.`, link].join("\n");
  }
  const bits = [`$${c.tk} on ${siteOf(c)}, last 24 hours`, `${fmt(w.v || 0)} ADA traded by ${fmt(w.wal || 0)} wallets. Net flow ${signed(w.net || 0)} ADA. Price ${w.ch != null ? pct(w.ch) : "flat"}.`];
  if (c.cs === "open" && c.prog != null) bits.push(`${(c.prog / 100).toFixed(0)}% of the way to graduating.`);
  bits.push(link);
  return bits.join("\n");
}

function resolve(s) {
  s = (s || "").trim().replace(/^\$/, "");
  // A Solada.fun or Snek.fun coin link, a ticker, or a coin id / slug.
  const m = s.match(/solada\.fun\/(?:coin|token|c)\/([A-Za-z0-9_-]+)/i) || s.match(/snek\.fun\/(?:token|coin)\/([0-9a-f]{58,})/i);
  if (m) s = m[1];
  const l = s.toLowerCase();
  // Tickers can repeat across launchpads: a coin in the chosen launchpad scope wins, then any coin.
  const byTk = data.coins.filter((c) => (c.tk || "").toLowerCase() === l);
  return byTk.find((c) => platform.inScope(c)) || byTk[0] || data.coins.find((c) => c.id === s || c.slug === s);
}

async function show(s) {
  const n = $("[data-notice]");
  const c = resolve(s);
  if (!c) { n.hidden = false; n.innerHTML = "<strong>Coin not found.</strong> Pick one from the list, or paste its Solada.fun or Snek.fun link."; return; }
  n.hidden = true;
  coin = c;
  $("[data-coin]").value = c.tk || c.id;
  const u = new URL(location.href); u.searchParams.set("coin", c.id); history.replaceState(null, "", u);
  sol = null;
  const [im, , sw] = await Promise.all([loadImg(c.img), loadSeries(c), loadSol(c)]);
  if (coin !== c) return;
  sol = sw;
  if (sol && series.length < 2) series = await loadSolSeries(sol);
  if (coin !== c) return;
  art = safeImage(im);
  await ready;
  draw();
  const cap = caption();
  $("[data-caption-preview]").textContent = cap;
  const dl = $("[data-download]"), cp = $("[data-copy-caption]");
  const fname = `gator-eyes-${(c.tk || c.id).replace(/[^A-Za-z0-9_-]/g, "")}.png`;
  // Make the PNG now, so a tap can hand it straight to the phone's share sheet
  // (phones drop the tap if we're still busy making the file).
  let file = null;
  try {
    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    if (coin !== c) return;
    if (blob) file = new File([blob], fname, { type: "image/png" });
  } catch {}
  const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  const mobile = matchMedia("(pointer: coarse)").matches;
  dl.textContent = !mobile ? "Download PNG" : canShare ? "Save or share image" : "Save image";
  dl.disabled = cp.disabled = false;
  dl.onclick = async () => {
    if (!file) { n.hidden = false; n.innerHTML = "<strong>This coin's image blocks downloads.</strong> Press and hold (or right-click) the card to save it."; return; }
    if (canShare && mobile) {
      try { await navigator.share({ files: [file], text: cap }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    if (!mobile) {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return;
    }
    holdToSave(file);
  };
  cp.onclick = async () => {
    try { await navigator.clipboard.writeText(cap); cp.textContent = "Copied"; } catch { cp.textContent = "Select and copy below"; }
    setTimeout(() => (cp.textContent = "Copy caption"), 1600);
  };
}

// Last resort on phones: show the card as a normal image, which can be saved by
// pressing and holding it.
function holdToSave(file) {
  const url = URL.createObjectURL(file);
  const box = document.createElement("div");
  box.className = "save-sheet";
  box.innerHTML = `<div class="save-sheet-in"><p>Press and hold the image, then choose <strong>Save</strong>.</p><img alt="Coin share card" src="${url}"><button class="btn btn-ghost" type="button">Done</button></div>`;
  const close = () => { box.remove(); URL.revokeObjectURL(url); };
  box.querySelector("button").onclick = close;
  box.addEventListener("click", (e) => { if (e.target === box) close(); });
  document.body.appendChild(box);
}

async function loadSeries(c) {
  series = [];
  if (c.id === "SOLADA") return;
  const from = Date.now() - 864e5;
  let before = "", list = [], dec = 6;
  try {
    for (let i = 0; i < 6; i++) {
      const j = await getApi("/coin-trades", { coin: c.slug || c.id, before });
      list.push(...j.trades);
      if (j.dec != null) dec = Number(j.dec);
      const last = j.trades[j.trades.length - 1];
      if (!j.more || !last || last.at < from) break;
      // Solada pages by timestamp; Snek.fun pages by offset, handed back as `next`.
      before = j.next != null ? j.next : last.at;
    }
  } catch {}
  // Price per token = ADA / (raw tokens / 10^decimals). Solada coins use 6 decimals, most Snek.fun coins none.
  const pts = list.filter((t) => t.tokens && t.ada).map((t) => [t.at, t.ada / (Number(t.tokens) / 10 ** dec)]).sort((a, b) => a[0] - b[0]);
  const before24 = pts.filter((p) => p[0] < from).pop();
  series = [...(before24 ? [[from, before24[1]]] : []), ...pts.filter((p) => p[0] >= from)];
}

$("[data-pick]").addEventListener("submit", (e) => { e.preventDefault(); show($("[data-coin]").value); });

function fillList() {
  if (!data) return;
  const seen = new Set();
  $("[data-list]").innerHTML = data.coins.filter((c) => c.tk && platform.inScope(c) && !seen.has(c.tk + "|" + platform.srcOf(c)) && seen.add(c.tk + "|" + platform.srcOf(c)))
    .map((c) => `<option value="${esc(c.tk)}">${esc(c.name || "")}${platform.get() === "all" && c.src === "snek" ? " · Snek.fun" : ""}</option>`).join("");
}

async function init() {
  try {
    data = await getApi("/tokens");
    let sources; try { sources = (await fetchFeed()).sources || undefined; } catch {}
    liveStatus({ updatedAt: new Date(data.updatedAt), sources });
  } catch (e) {
    liveStatus(null, e);
    const n = $("[data-notice]"); n.hidden = false; n.innerHTML = "<strong>Can't reach the Gator Eyes feed right now.</strong> Try again in a minute.";
    return;
  }
  fillList();
  const pre = new URLSearchParams(location.search).get("coin");
  const def = pre || ([...data.coins].filter((c) => platform.inScope(c)).sort((a, b) => ((b.w.h24 || {}).v || 0) - ((a.w.h24 || {}).v || 0))[0] || {}).id;
  if (def) show(def);
}
init();
void timeAgo;

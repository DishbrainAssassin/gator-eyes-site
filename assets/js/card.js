// Daily flow card: draws one day of Solada flows onto a 1200x675 canvas
// (X and Discord friendly) and lets you download it as a PNG.
import { subscribe } from "./data.js?v=20261101b";
import { wireLinks, liveStatus } from "./common.js?v=20261101b";
import { dayLabel, fmt, compact, esc } from "./ui.js?v=20261101b";

wireLinks();

const $ = (s) => document.querySelector(s);
const canvas = $("[data-card]");
const ctx = canvas.getContext("2d");
const W = 1200, H = 675;
const C = { bg: "#06090a", panel: "#0c1112", line: "#1e2a2b", text: "#e4e2db", muted: "#9aa29d", faint: "#5f6b67", amber: "#e3a43c", buy: "#6fbf73", sell: "#e0705f" };
const F = { d: '"Cabinet Grotesk", "Helvetica Neue", sans-serif', b: '"Satoshi", "Helvetica Neue", sans-serif', m: '"JetBrains Mono", ui-monospace, monospace' };
const VEN = { curve: "Solada curve", minswap: "Minswap", splash: "Splash", pump: "Pump.fun", other: "Other" };

let feed = null;
let day = null;
const avatar = new Image();
avatar.src = "./assets/img/avatar-256.webp";
const ready = Promise.all([
  document.fonts.load(`800 72px ${F.d}`),
  document.fonts.load(`700 20px ${F.d}`),
  document.fonts.load(`500 18px ${F.b}`),
  document.fonts.load(`700 18px ${F.b}`),
  document.fonts.load(`500 18px ${F.m}`),
  new Promise((r) => (avatar.complete ? r() : ((avatar.onload = r), (avatar.onerror = r)))),
]).catch(() => {});

const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));
const hourName = (h) => (h === 0 ? "12 AM" : h < 12 ? h + " AM" : h === 12 ? "12 PM" : h - 12 + " PM");

function text(s, x, y, { font, color = C.text, align = "left", spacing = 0 } = {}) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
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
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function coinsOf(d) {
  return d.coins && d.coins.length ? d.coins : [...(d.inflow || []), ...(d.outflow || []), ...(d.top || [])];
}
function busiest(d) {
  if (!d.hours) return null;
  let bi = -1, bv = 0;
  d.hours.forEach((h, i) => { if (h[0] + h[1] > bv) { bv = h[0] + h[1]; bi = i; } });
  return bi >= 0 ? { h: bi, v: bv } : null;
}
function topVenue(d) {
  if (!d.venues) return null;
  const rows = Object.entries(d.venues).map(([k, v]) => ({ k, t: v[0] + v[1] }));
  const tot = rows.reduce((a, r) => a + r.t, 0);
  const top = rows.sort((a, b) => b.t - a.t)[0];
  return top && tot ? { name: VEN[top.k] || top.k, pct: Math.round((top.t / tot) * 100) } : null;
}

function draw(opt) {
  const d = opt.d;
  const rate = feed.rate;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  // faint waterline glow
  const g = ctx.createRadialGradient(W * 0.85, -60, 10, W * 0.85, -60, 520);
  g.addColorStop(0, "rgba(227,164,60,0.14)");
  g.addColorStop(1, "rgba(227,164,60,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const P = 56;
  // header
  if (avatar.naturalWidth) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(P + 22, 62, 22, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, P, 40, 44, 44);
    ctx.restore();
  }
  text("GATOR TRACKS", P + 60, 70, { font: `800 20px ${F.d}`, color: C.amber, spacing: 4 });
  const label = opt.live ? `Today so far · ${dayLabel(d.key)}` : dayLabel(d.key);
  text(label, W - P, 62, { font: `700 20px ${F.b}`, align: "right" });
  text(d.partial ? "Solada · partial day · Eastern time" : "Solada · Eastern time", W - P, 86, { font: `500 15px ${F.b}`, color: C.muted, align: "right" });

  // headline
  text(`${compact(d.volAda)} ADA traded`, P, 168, { font: `800 72px ${F.d}` });
  const usd = rate ? `~${fmt(d.volAda * rate)} USDCx · ` : "";
  text(`${usd}${fmt(d.trades)} trades · ${fmt(d.wallets)} wallets`, P, 204, { font: `500 20px ${F.b}`, color: C.muted });

  // KPI row
  const net = d.buyAda - d.sellAda;
  const kw = (660 - 3 * 12) / 4;
  const kpis = [
    ["Net flow", signed(net) + " ADA", net >= 0 ? C.buy : C.sell],
    ["Bought", fmt(d.buyAda) + " ADA", C.text],
    ["Sold", fmt(d.sellAda) + " ADA", C.text],
    [d.big ? fit(`Biggest · ${d.big.side} $${d.big.tk}`, kw - 32, `500 14px ${F.b}`) : "Biggest trade", d.big ? fmt(d.big.ada) + " ADA" : "–", C.text],
  ];
  kpis.forEach(([l, v, col], i) => {
    const x = P + i * (kw + 12);
    rrect(x, 232, kw, 78, 10, C.panel, C.line);
    text(l, x + 16, 260, { font: `500 14px ${F.b}`, color: C.muted });
    text(fit(v, kw - 32, `500 19px ${F.m}`), x + 16, 292, { font: `500 19px ${F.m}`, color: col });
  });

  // hourly chart
  const cx = P, cy = 342, cw = 660, ch = 230;
  rrect(cx, cy, cw, ch, 12, C.panel, C.line);
  text("Bought and sold by hour", cx + 18, cy + 30, { font: `700 15px ${F.b}`, color: C.text });
  const bz = busiest(d);
  if (bz) text(`Busiest: ${hourName(bz.h)} · ${compact(bz.v)} ADA`, cx + cw - 18, cy + 30, { font: `500 13px ${F.m}`, color: C.muted, align: "right" });
  if (d.hours) {
    const max = Math.max(1, ...d.hours.map((h) => Math.max(h[0], h[1])));
    const top = cy + 50, mid = cy + 50 + 74, half = 70;
    const bw = (cw - 36) / 24;
    ctx.fillStyle = C.line;
    ctx.fillRect(cx + 18, mid, cw - 36, 1);
    d.hours.forEach((h, i) => {
      const x = cx + 18 + i * bw + 2;
      const w = bw - 4;
      const hb = (h[0] / max) * half, hs = (h[1] / max) * half;
      if (hb) rrect(x, mid - hb, w, hb, 2, C.buy);
      if (hs) rrect(x, mid + 1, w, hs, 2, C.sell);
      if (i % 3 === 0) text(i === 0 ? "12a" : i < 12 ? i + "a" : i === 12 ? "12p" : i - 12 + "p", x + w / 2, cy + ch - 14, { font: `500 12px ${F.m}`, color: C.faint, align: "center" });
    });
    void top;
  } else {
    text("Hour-by-hour detail starts with the updated bot.", cx + 18, cy + 120, { font: `500 15px ${F.b}`, color: C.muted });
  }

  // right column: money in / out
  const rx = 744, rw = W - P - rx;
  rrect(rx, 232, rw, 340, 12, C.panel, C.line);
  const all = coinsOf(d);
  const seen = new Set();
  const uniq = all.filter((k) => (seen.has(k.id) ? false : seen.add(k.id)));
  const ins = uniq.filter((k) => k.net > 0).sort((a, b) => b.net - a.net).slice(0, 5);
  const outs = uniq.filter((k) => k.net < 0).sort((a, b) => a.net - b.net).slice(0, 3);
  const mx = Math.max(1, ...[...ins, ...outs].map((k) => Math.abs(k.net)));
  const rows = (list, y0, color, title) => {
    text(title, rx + 18, y0, { font: `700 15px ${F.b}` });
    if (!list.length) { text("None", rx + 18, y0 + 30, { font: `500 15px ${F.b}`, color: C.muted }); return; }
    list.forEach((k, i) => {
      const y = y0 + 30 + i * 30;
      text(fit("$" + k.tk, 110, `700 15px ${F.b}`), rx + 18, y, { font: `700 15px ${F.b}` });
      const bx = rx + 136, bwMax = rw - 136 - 100;
      rrect(bx, y - 11, Math.max(4, (Math.abs(k.net) / mx) * bwMax), 10, 3, color);
      text(signed(k.net), rx + rw - 18, y, { font: `500 14px ${F.m}`, color, align: "right" });
    });
  };
  rows(ins, 262, C.buy, "Money in");
  rows(outs, 262 + 30 + 5 * 30 + 20, C.sell, "Money out");

  // footer
  const tv = topVenue(d);
  ctx.fillStyle = C.line;
  ctx.fillRect(P, H - 70, W - 2 * P, 1);
  text("Lurking so you don't have to", P, H - 32, { font: `800 18px ${F.d}`, color: C.text });
  const right = [tv ? `Top venue: ${tv.name} ${tv.pct}%` : null, "@GatorEyesADA", "Not financial advice"].filter(Boolean).join("  ·  ");
  text(right, W - P, H - 32, { font: `500 14px ${F.b}`, color: C.muted, align: "right" });
}

function caption(opt) {
  const d = opt.d;
  const net = d.buyAda - d.sellAda;
  const coins = coinsOf(d).filter((k) => k.net > 0).sort((a, b) => b.net - a.net).slice(0, 3).map((k) => "$" + k.tk);
  const flows = new URL("./flows.html", location.href).toString();
  return [
    `Gator Tracks · ${opt.live ? "today so far" : dayLabel(d.key)}`,
    `${fmt(d.volAda)} ADA${feed.rate ? ` (~${fmt(d.volAda * feed.rate)} USDCx)` : ""} traded on Solada by ${fmt(d.wallets)} wallets. Net flow ${signed(net)} ADA${feed.rate ? ` (~${signed(Math.round(net * feed.rate))} USDCx)` : ""}.`,
    coins.length ? `Money in: ${coins.join(", ")}` : null,
    `Live flows: ${flows}`,
  ].filter(Boolean).join("\n");
}

function options() {
  const o = [];
  for (const r of feed.recaps) o.push({ id: r.key, label: dayLabel(r.key).slice(0, 3) + " " + r.key.slice(5).replace("-", "/"), d: r });
  if (feed.today && feed.today.trades) o.unshift({ id: "today", label: "Today so far", d: feed.today, live: true });
  // Default to the latest full day; it's the one worth sharing.
  return o;
}

async function render() {
  if (!feed) return;
  const opts = options();
  const daysEl = $("[data-days]");
  if (!opts.length) {
    daysEl.innerHTML = "";
    return;
  }
  if (!day || !opts.find((o) => o.id === day)) day = (opts.find((o) => !o.live) || opts[0]).id;
  daysEl.innerHTML = opts.map((o) => `<button role="tab" class="tab ${o.id === day ? "is-on" : ""}" aria-selected="${o.id === day}" data-day="${o.id}">${esc(o.label)}</button>`).join("");
  daysEl.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => { day = b.dataset.day; render(); }));
  const opt = opts.find((o) => o.id === day);
  await ready;
  draw(opt);
  const cap = caption(opt);
  $("[data-caption-preview]").textContent = cap;
  const dl = $("[data-download]"), cp = $("[data-copy-caption]");
  dl.disabled = cp.disabled = false;
  dl.onclick = () => {
    const a = document.createElement("a");
    a.download = `gator-tracks-${opt.live ? "today" : opt.d.key}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };
  cp.onclick = async () => {
    try { await navigator.clipboard.writeText(cap); cp.textContent = "Copied"; } catch { cp.textContent = "Select and copy below"; }
    setTimeout(() => (cp.textContent = "Copy caption"), 1600);
  };
}

subscribe((f, err) => {
  liveStatus(f, err);
  const first = !feed && f;
  if (f) feed = f;
  if (first || f) render();
});

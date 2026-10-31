// Reusable display pieces. Each takes plain data and returns HTML, so the same
// pieces can be rearranged into a dashboard later.
import { withRef, coinUrl } from "./data.js?v=20261031s";
import { pill, srcOf, LP } from "./platform.js?v=20261031t";

export const KINDS = {
  big: { label: "Whale", cls: "k-whale" },
  spike: { label: "Volume spike", cls: "k-spike" },
  dev: { label: "Creator sell", cls: "k-dev" },
  launch: { label: "Fast launch", cls: "k-launch" },
  watch: { label: "$GAEY", cls: "k-gaey" },
};

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const fmt = (n, d = 0) => (n == null || isNaN(n) ? "–" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d }));

export function usdcx(ada, rate) {
  if (!rate || ada == null) return "";
  const v = ada * rate;
  return `~${fmt(v, v < 10 ? 2 : 0)} USDCx`;
}

export function usdcxSigned(ada, rate) {
  if (!rate || ada == null) return "";
  const v = ada * rate;
  const a = Math.abs(v);
  return `~${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(a, a < 10 ? 2 : 0)} USDCx`;
}

/** One-line note on the ADA to USDCx rate behind every ~USDCx figure. */
export function rateNote(rate) {
  if (!rate) return "";
  return `USDCx figures are approximate, at 1 ADA ≈ ${fmt(rate, 4)} USDCx from the latest check.`;
}

export function compact(n) {
  if (n == null) return "–";
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return fmt(n);
}

export function timeAgo(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return m + " min ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + " hr ago";
  return Math.round(h / 24) + " d ago";
}

export const clock = (ms) =>
  new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";

export function dayLabel(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

/** Tiny Discord-markdown renderer: **bold**, [text](url), new lines. Solada links get the referral code. */
export function md(src) {
  let h = esc(src);
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => {
    const url = withRef(u.replace(/&amp;/g, "&"));
    return `<a href="${esc(url)}" target="_blank" rel="noopener">${t}</a>`;
  });
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return h.replace(/\n/g, "<br>");
}

export function alertCard(a) {
  const k = KINDS[a.kind] || { label: a.kind, cls: "" };
  const sd = a.side || (/\bBUY\b/.test(a.title) ? "buy" : /\bSELL\b/.test(a.title) ? "sell" : null);
  const side = sd === "buy" ? "is-buy" : sd === "sell" ? "is-sell" : "";
  const title = esc(a.title).replace(/\$([A-Za-z0-9]+)/, (m) => `<a href="${esc(a.url || coinUrl(a.tokenId))}" target="_blank" rel="noopener">${m}</a>`);
  const fields = (a.fields || [])
    .map((f) => `<div class="af"><dt>${esc(f.name)}</dt><dd>${md(f.value)}</dd></div>`)
    .join("");
  const img = a.img ? `<img class="alert-img" src="${esc(a.img)}" alt="" loading="lazy" width="44" height="44" onerror="this.style.visibility='hidden'">` : "";
  const src = srcOf(a);
  return `<article class="alert ${k.cls} ${side} ${LP[src].cls}" data-src="${src}">
    <header class="alert-head">
      <span class="alert-head-left"><span class="badge">${esc(k.label)}</span>${pill(src)}</span>
      <time datetime="${new Date(a.at).toISOString()}" title="${esc(clock(a.at))}">${esc(timeAgo(a.at))}</time>
    </header>
    <div class="alert-body">
      ${img}
      <div class="alert-text">
        <h3 class="alert-title">${title}</h3>
        <p class="alert-desc">${md(a.desc)}</p>
        ${fields ? `<dl class="alert-fields">${fields}</dl>` : ""}
      </div>
    </div>
  </article>`;
}

export function emptyState(msg, html = "") {
  return `<div class="empty"><p>${esc(msg)}${html}</p></div>`;
}

export function skeleton(n = 4) {
  return Array.from({ length: n }, () => `<div class="alert skel" aria-hidden="true"><span></span><span></span><span></span></div>`).join("");
}

const coinLink = (id, tk) => `<a href="${esc(coinUrl(id))}" target="_blank" rel="noopener">$${esc(tk)}</a>`;
const coinTag = (k) => (k.lp ? `<span class="coin-tag">${coinLink(k.id, k.tk)}${pill(k.lp)}</span>` : coinLink(k.id, k.tk));

/** Launchpad of a day tally's coin id. */
const lpOfId = (id) => (typeof id === "string" && id.startsWith("snek:") ? "snek" : "solada");

/** Fold two day tallies (Solada + Snek.fun) into one, tagging coins with their launchpad. Wallets are summed. */
export function mergeDays(sol, snek) {
  const parts = [sol, snek].filter((d) => d && d.trades);
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  const tag = (list) => (list || []).map((k) => ({ ...k, lp: lpOfId(k.id) }));
  const coins = [...tag(sol.coins && sol.coins.length ? sol.coins : sol.top), ...tag(snek.coins && snek.coins.length ? snek.coins : snek.top)];
  const bySort = (f) => [...coins].sort(f);
  const big = [sol.big, snek.big].filter(Boolean).sort((a, b) => b.ada - a.ada)[0] || null;
  const hours = sol.hours && snek.hours ? sol.hours.map((h, i) => [h[0] + snek.hours[i][0], h[1] + snek.hours[i][1], h[2] + snek.hours[i][2]]) : sol.hours || snek.hours || null;
  const venues = { ...(sol.venues || {}) };
  for (const [k, v] of Object.entries(snek.venues || {})) venues[k] = venues[k] ? [venues[k][0] + v[0], venues[k][1] + v[1], venues[k][2] + v[2]] : v;
  return {
    key: sol.key, partial: !!(sol.partial || snek.partial), merged: true,
    trades: sol.trades + snek.trades, volAda: sol.volAda + snek.volAda, buyAda: sol.buyAda + snek.buyAda, sellAda: sol.sellAda + snek.sellAda,
    wallets: sol.wallets + snek.wallets,
    dev: { n: (sol.dev ? sol.dev.n : 0) + (snek.dev ? snek.dev.n : 0), ada: (sol.dev ? sol.dev.ada : 0) + (snek.dev ? snek.dev.ada : 0) },
    big: big ? { ...big, lp: lpOfId(big.id) } : null,
    top: bySort((a, b) => b.v - a.v).slice(0, 10),
    inflow: coins.filter((k) => k.net > 0).sort((a, b) => b.net - a.net).slice(0, 5),
    outflow: coins.filter((k) => k.net < 0).sort((a, b) => a.net - b.net).slice(0, 5),
    coins: bySort((a, b) => b.v - a.v),
    hours, venues,
    parts: { solada: sol, snek },
  };
}

/** "By launchpad" rows: each launchpad's share of the day, clickable to focus on it. */
export function lpSplit(parts, rate, scope = "all") {
  const rows = Object.entries(parts || {}).filter(([, d]) => d && d.trades);
  if (rows.length < 2) return "";
  const total = rows.reduce((a, [, d]) => a + d.volAda, 0) || 1;
  const row = ([key, d]) => {
    const lp = LP[key] || LP.solada;
    const share = (d.volAda / total) * 100;
    const net = d.buyAda - d.sellAda;
    return `<div class="lp-row ${lp.cls} ${scope !== "all" && scope !== key ? "is-dim" : ""}">
      <button type="button" class="lp-name" data-platform-pick="${key}" title="Show ${esc(lp.label)} only"><i></i>${esc(lp.label)}</button>
      <div class="lp-bar" style="--share:${share}%" role="img" aria-label="${esc(lp.label)}: ${fmt(d.volAda)} ADA, ${Math.round(share)}% of the day"><span class="b" style="width:${d.volAda ? (d.buyAda / d.volAda) * 100 : 0}%"></span><span class="s" style="width:${d.volAda ? (d.sellAda / d.volAda) * 100 : 0}%"></span></div>
      <span class="lp-num">${compact(d.volAda)} ADA · ${Math.round(share)}%<small>${fmt(d.trades)} trades · ${fmt(d.wallets)} wallets · net ${net >= 0 ? "+" : "−"}${fmt(Math.abs(net))}${rate ? " · " + usdcx(d.volAda, rate) : ""}</small></span>
    </div>`;
  };
  return `<div class="lp-split-wrap"><div class="sub-row"><h3 class="sub">By launchpad</h3>${scope !== "all" ? `<button type="button" class="link" data-platform="all">Compare all</button>` : `<span class="sub-hint">Pick one to focus on it</span>`}</div><div class="lp-split">${rows.map(row).join("")}</div></div>`;
}

/** Gator Tracks panel for one day's tally (today so far, or a finished recap). */
export function tracks(d, rate) {
  if (!d || !d.trades) return emptyState("No trades counted for this day yet.");
  const buyPct = d.volAda ? Math.round((d.buyAda / d.volAda) * 100) : 50;
  const maxV = Math.max(...d.top.map((k) => k.v), 1);
  const rows = d.top
    .slice(0, 8)
    .map(
      (k, i) => `<tr>
      <td class="num rank">${i + 1}</td>
      <td>${coinTag(k)}</td>
      <td class="num">${fmt(k.v)}<span class="bar" style="--w:${Math.max(4, (k.v / maxV) * 100)}%"></span></td>
      <td class="num hide-sm">${fmt(k.n)}</td>
      <td class="num ${k.net >= 0 ? "pos" : "neg"}">${k.net >= 0 ? "+" : "−"}${fmt(Math.abs(k.net))}</td>
    </tr>`
    )
    .join("");
  const flowList = (list, sign) =>
    list.length
      ? `<ol class="flow-list">${list
          .map((k) => `<li>${coinTag(k)}<span class="num ${sign > 0 ? "pos" : "neg"}">${sign > 0 ? "+" : "−"}${fmt(Math.abs(k.net))} ADA${rate ? `<span class="cell-sub">${usdcx(Math.abs(k.net), rate)}</span>` : ""}</span></li>`)
          .join("")}</ol>`
      : `<p class="muted">None</p>`;
  return `
  <div class="kpis">
    <div class="kpi"><span class="kpi-label">Volume</span><span class="kpi-value">${compact(d.volAda)} ADA</span><span class="kpi-sub">${usdcx(d.volAda, rate)}</span></div>
    <div class="kpi"><span class="kpi-label">Trades</span><span class="kpi-value">${fmt(d.trades)}</span><span class="kpi-sub">${fmt(d.wallets)} wallets</span></div>
    <div class="kpi"><span class="kpi-label">Biggest trade</span><span class="kpi-value">${d.big ? compact(d.big.ada) + " ADA" : "–"}</span><span class="kpi-sub">${d.big ? `${esc(d.big.side)} ${coinTag(d.big)}${rate ? " · " + usdcx(d.big.ada, rate) : ""}` : ""}</span></div>
    <div class="kpi"><span class="kpi-label">Creator sells</span><span class="kpi-value">${fmt(d.dev.n)}</span><span class="kpi-sub">${fmt(d.dev.ada)} ADA${d.dev.ada && rate ? " · " + usdcx(d.dev.ada, rate) : ""}</span></div>
  </div>
  <div class="split" role="img" aria-label="${buyPct}% of volume was buys">
    <div class="split-bar"><span class="split-buy" style="width:${buyPct}%"></span></div>
    <div class="split-legend"><span><i class="dot buy"></i>Buys ${fmt(d.buyAda)} ADA <span class="muted">${usdcx(d.buyAda, rate)}</span></span><span><i class="dot sell"></i>Sells ${fmt(d.sellAda)} ADA <span class="muted">${usdcx(d.sellAda, rate)}</span></span></div>
  </div>
  <div class="tracks-grid">
    <div class="tracks-table">
      <h3 class="sub">Most traded</h3>
      <table>
        <thead><tr><th class="num">#</th><th>Coin</th><th class="num">Volume (ADA)</th><th class="num hide-sm">Trades</th><th class="num">Net flow</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="flows">
      <div><h3 class="sub">Money in</h3>${flowList(d.inflow, 1)}</div>
      <div><h3 class="sub">Money out</h3>${flowList(d.outflow, -1)}</div>
    </div>
  </div>
  ${rate ? `<p class="rate-note">${rateNote(rate)}</p>` : ""}`;
}

import { CONFIG } from "./config.js?v=20261101r";
import { subscribe } from "./data.js?v=20261101r";
import { alertCard, emptyState, skeleton, fmt, usdcx, compact, timeAgo } from "./ui.js?v=20261101r";
import { wireLinks, liveStatus } from "./common.js?v=20261101r";

wireLinks();
const $ = (s) => document.querySelector(s);
const statsEl = $("[data-gaey-stats]");
const tradesEl = $("[data-gaey-trades]");
const factsEl = $("[data-facts]");
const updatedEl = $("[data-updated]");
const img = $("[data-gaey-img]");
const G = CONFIG.gaey;

tradesEl.innerHTML = skeleton(3);

function price(p) {
  if (p == null) return "–";
  if (p >= 0.01) return fmt(p, 4);
  const s = p.toPrecision(3);
  return Number(s).toFixed(Math.min(12, 2 - Math.floor(Math.log10(p))));
}

function facts(launchMs) {
  const copy = (label, v) =>
    `<div class="fact"><dt>${label}</dt><dd><code>${v}</code><button class="copy" data-copy="${v}" aria-label="Copy ${label}">Copy</button></dd></div>`;
  factsEl.innerHTML = `
    <div class="fact"><dt>Name</dt><dd>${G.name} ($${G.ticker})</dd></div>
    <div class="fact"><dt>Rewards</dt><dd>Holder rewards are paid in ADA</dd></div>
    <div class="fact"><dt>Total supply</dt><dd>${fmt(G.totalSupply)}</dd></div>
    <div class="fact"><dt>Launched</dt><dd>${launchMs ? new Date(launchMs).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }) + " ET" : "Oct 26, 2026"} on Solada</dd></div>
    ${copy("Cardano policy ID", G.cardanoPolicy)}
    ${copy("Solana mint", G.solanaMint)}
    <div class="fact"><dt>Explorers</dt><dd><a href="https://cardanoscan.io/tokenPolicy/${G.cardanoPolicy}" target="_blank" rel="noopener">Cardanoscan</a> · <a href="https://solscan.io/token/${G.solanaMint}" target="_blank" rel="noopener">Solscan</a></dd></div>`;
  factsEl.querySelectorAll("[data-copy]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        b.textContent = "Copied";
      } catch {
        b.textContent = "Select and copy";
      }
      setTimeout(() => (b.textContent = "Copy"), 1600);
    })
  );
}
facts(null);

subscribe((f, err) => {
  liveStatus(f, err);
  if (!f) {
    statsEl.innerHTML = emptyState("Live numbers are reconnecting. $GAEY trades are still posting in Discord.");
    tradesEl.innerHTML = "";
    return;
  }
  updatedEl.textContent = f.updatedAt ? "Updated " + timeAgo(f.updatedAt.getTime()) : "";
  const w = f.watch || {};
  const q = w.quote;
  if (w.image) img.src = w.image;
  if (w.liveAtMs) facts(w.liveAtMs);
  if (q) {
    const mcAda = f.rate && q.marketCapUsd ? q.marketCapUsd / f.rate : null;
    const ch = Number(q.change24hPct);
    statsEl.innerHTML = `
      <div class="kpi"><span class="kpi-label">Price</span><span class="kpi-value">${price(q.priceUsd)}</span><span class="kpi-sub">USDCx</span></div>
      <div class="kpi"><span class="kpi-label">Market cap</span><span class="kpi-value">${compact(mcAda)} ADA</span><span class="kpi-sub">${usdcx(mcAda, f.rate)}</span></div>
      <div class="kpi"><span class="kpi-label">Holders</span><span class="kpi-value">${fmt(q.holders)}</span><span class="kpi-sub">wallets</span></div>
      <div class="kpi"><span class="kpi-label">24h volume</span><span class="kpi-value">${compact(f.rate ? q.volume24hUsd / f.rate : null)} ADA</span><span class="kpi-sub">~${fmt(q.volume24hUsd)} USDCx</span></div>
      <div class="kpi"><span class="kpi-label">24h change</span><span class="kpi-value ${ch >= 0 ? "pos" : "neg"}">${isNaN(ch) ? "–" : (ch >= 0 ? "+" : "−") + fmt(Math.abs(ch), 1) + "%"}</span><span class="kpi-sub">${fmt(q.trades24h)} trades</span></div>
      <div class="kpi"><span class="kpi-label">Pump.fun curve</span><span class="kpi-value">${q.pumpProgressBps != null ? fmt(q.pumpProgressBps / 100, 1) + "%" : "–"}</span><span class="kpi-sub">filled</span></div>`;
  } else {
    statsEl.innerHTML = emptyState("Waiting for the first $GAEY price from Solada.");
  }
  const trades = f.alerts.filter((a) => a.kind === "watch" || a.tokenId === CONFIG.watchToken).slice(0, 15);
  tradesEl.innerHTML = trades.length ? trades.map(alertCard).join("") : emptyState("No $GAEY trades in the last few hours.");
});

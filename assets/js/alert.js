// Alert page: where a phone notification tap lands. The link carries the alert(s) it was about
// (?i= base64url JSON [[kind, tokenId, at, ada, src, title, body], ...], written by the worker's
// pushMsg). We show the full alert from /feed when it's still there, otherwise the notification's
// own words, plus quick links to the coin.
import { getApi } from "./api.js?v=20261102-hatch";
import { fetchFeed, coinUrl } from "./data.js?v=20261102-hatch";
import { esc, alertCard, emptyState } from "./ui.js?v=20261102-hatch";
import { wireLinks, liveStatus } from "./common.js?v=20261102-hatch";
import * as watchlist from "./watchlist.js?v=20261102-hatch";

wireLinks();
watchlist.wire();

const $ = (s) => document.querySelector(s);
const listEl = $("[data-alert-list]");
const coinsEl = $("[data-alert-coins]");
const h1 = $("[data-alert-h]");
const lede = $("[data-alert-lede]");

export function decodeKeys(raw) {
  if (!raw) return [];
  try {
    const b = raw.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b + "=".repeat((4 - (b.length % 4)) % 4));
    const keys = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    if (!Array.isArray(keys)) return [];
    return keys
      .filter((k) => Array.isArray(k) && typeof k[0] === "string")
      .slice(0, 8)
      .map(([kind, tokenId, at, ada, src, title, body]) => ({
        kind, tokenId: tokenId || null, at: Number(at) || Date.now(), ada: ada == null ? null : Number(ada),
        src: src === "snek" ? "snek" : "solada", title: String(title || ""), desc: String(body || ""),
      }));
  } catch {
    return [];
  }
}

const keys = decodeKeys(new URLSearchParams(location.search).get("i"));

// Same alert in /feed: same kind and coin, within a few seconds (the feed keeps the exact time).
function match(k, alerts) {
  return alerts.find((a) => a.kind === k.kind && (a.tokenId || null) === k.tokenId && Math.abs(Number(a.at) - k.at) < 5000);
}

function coinActions(id, coin, src) {
  const q = "?coin=" + encodeURIComponent(id);
  const tk = coin && coin.tk ? "$" + coin.tk : "this coin";
  const pad = src === "snek" ? "Snek.fun" : "Solada";
  const star = watchlist.starBtn(coin ? { id, tk: coin.tk, name: coin.name, img: coin.img, src: coin.src } : id);
  return `<div class="alert-coin">
    <div class="alert-coin-head">${coin && coin.img ? `<img src="${esc(coin.img)}" alt="" width="36" height="36" loading="lazy" onerror="this.style.visibility='hidden'">` : ""}<strong>${esc(tk)}</strong>${coin && coin.name ? `<span>${esc(coin.name)}</span>` : ""}${star}</div>
    <div class="alert-coin-links">
      <a class="btn btn-amber btn-sm" href="${esc(coinUrl(id))}" target="_blank" rel="noopener">Open on ${pad} <span aria-hidden="true">&rarr;</span></a>
      <a class="btn btn-ghost btn-sm" href="./trades.html${q}">Trades</a>
      <a class="btn btn-ghost btn-sm" href="./holders.html${q}">Holders</a>
      <a class="btn btn-ghost btn-sm" href="./followup.html${q}">Follow-up</a>
    </div>
  </div>`;
}

function render(feed, tokens) {
  if (!keys.length) {
    h1.textContent = "Recent alerts";
    lede.textContent = "This link doesn't point to a specific alert.";
    listEl.innerHTML = emptyState("Couldn't read which alert this was.", ` See <a href="./index.html#alerts">all recent alerts</a> instead.`);
    coinsEl.innerHTML = "";
    return;
  }
  const alerts = (feed && feed.alerts) || [];
  const coins = new Map(((tokens && tokens.coins) || []).map((c) => [c.id, c]));
  let gone = 0;
  const shown = keys.map((k) => {
    const full = match(k, alerts);
    if (full) return full;
    if (k.kind !== "wtrade") gone++; // starred-coin trades never appear in /feed
    const c = coins.get(k.tokenId);
    return { ...k, img: c && c.img, side: /\bsell\b/i.test(k.title) ? "sell" : /\bbuy\b/i.test(k.title) ? "buy" : null };
  });
  const n = shown.length;
  h1.textContent = n === 1 ? "Your alert" : `Your ${n} alerts`;
  lede.textContent = n === 1
    ? "The alert from your notification, with quick links to the coin."
    : "The alerts from your notification, newest first, with quick links to each coin.";
  if (gone && feed) lede.textContent += gone === n && n > 0
    ? " It's no longer in the live feed, so this is the notification's own summary."
    : " Some have rolled off the live feed, so those show the notification's own summary.";
  shown.sort((a, b) => Number(b.at) - Number(a.at));
  listEl.classList.toggle("is-one", n === 1);
  listEl.innerHTML = shown.map(alertCard).join("");
  const ids = [...new Set(shown.map((a) => a.tokenId).filter(Boolean))];
  coinsEl.innerHTML = ids.length
    ? `<h2 class="alert-coins-h">${ids.length === 1 ? "The coin" : "The coins"}</h2>` + ids.map((id) => coinActions(id, coins.get(id), (shown.find((a) => a.tokenId === id) || {}).src)).join("")
    : "";
}

async function load() {
  render(null, null);
  const [feed, tokens] = await Promise.all([fetchFeed().catch(() => null), getApi("/tokens").catch(() => null)]);
  liveStatus(feed, feed ? null : new Error("feed"));
  render(feed, tokens);
}
load();


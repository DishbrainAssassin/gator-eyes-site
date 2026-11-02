// Gator Nest: a rotating spotlight on the best new Gator Eyes features.
// Each return visit shows the next one; arrows and dots browse all of them.
// Items are typed so a future "coin" slot (featured coins) can join the rotation
// without changing the rotation or layout code.
import { esc } from "./ui.js?v=20261102-statcard";
import * as watchlist from "./watchlist.js?v=20261102-statcard";

export const ITEMS = [
  { type: "feature", key: "phone", tag: "Phone alerts", title: "Alerts on your phone", href: "./app.html", cta: "Set up phone alerts",
    text: "Whale buys, volume spikes, creator sells and new launches as phone notifications. Pick which ones you want and mute them for a while whenever you like.",
    skip: () => typeof Notification !== "undefined" && Notification.permission === "granted" },
  { type: "feature", key: "watch", tag: "Watchlist", title: "Star the coins you care about", href: "./watchlist.html", cta: "Open your watchlist",
    text: "Tap the star on any coin to keep its flows, curve progress and alerts on one page. Saved in your browser. No account needed.",
    skip: () => watchlist.count() > 0 },
  { type: "feature", key: "unlocks", tag: "Unlock calendar", title: "See unlocks before they happen", href: "./unlocks.html", cta: "Check the unlock calendar",
    text: "Solada token locks checked on-chain, listed by day and by coin, so you know when locked supply can come back to the market." },
  { type: "feature", key: "holders", tag: "Holder snapshot", title: "Find out who holds a coin", href: "./holders.html", cta: "Look up holders",
    text: "See where a coin's supply sits: pools, locks, burns, Solada's own wallets and the biggest holders, each one labeled." },
  { type: "feature", key: "trades", tag: "Trade history", title: "Every buy and sell for one coin", href: "./trades.html", cta: "Open trade history",
    text: "Filter one coin's trades by side, size or wallet and download them as a CSV. Pump coins include their Solana-side trades." },
  { type: "feature", key: "race", tag: "Graduation race", title: "Who graduates next", href: "./race.html", cta: "Watch the race",
    text: "Coins closest to graduating from the bonding curve, with their pace and a rough time to finish." },
  { type: "feature", key: "graduated", tag: "Graduated coins", title: "Every coin that made it", href: "./graduated.html", cta: "See graduated coins",
    text: "Every graduate on Solada.fun, Snek.fun and Solada's Pump coins on Solana: when it graduated, how long it took, and how it has traded since. Switch between Cardano and Solana." },
  { type: "feature", key: "ask", tag: "Ask Quagmire", title: "Ask about any coin", ask: "What's close to graduating?", cta: "Ask Quagmire",
    text: "Ask in plain English about market cap, holders, inflows or what's close to graduating. Quagmire answers from the same live data as the site." },
  { type: "feature", key: "flows", tag: "Flows", title: "Follow the money", href: "./flows.html", cta: "Open Flows",
    text: "Buys and sells by hour, net flow by launchpad, and a weekly summary, with Solada and Snek.fun side by side or one at a time." },
  { type: "feature", key: "card", tag: "Stat cards", title: "Share a coin's stats", href: "./coincard.html", cta: "Make a stat card",
    text: "Make a clean stat card for any coin, then save it or share it in a tap." },
];

const KEY = "ge-nest";
const SESSION = "ge-nest-s";
const AWAY_MS = 30 * 60 * 1000; // a visit after 30+ minutes away counts as coming back

function readState() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
function writeState(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; }
}
function newSession() {
  try {
    if (sessionStorage.getItem(SESSION)) return false;
    sessionStorage.setItem(SESSION, "1");
    return true;
  } catch { return true; }
}
const usable = (it) => { try { return !(it.skip && it.skip()); } catch { return true; } };

/** Which spotlight to show on this visit. First visit starts with #1; each return moves on one. */
export function pick(items = ITEMS, now = Date.now()) {
  const n = items.length;
  const st = readState();
  const fresh = newSession();
  let i;
  if (!st || typeof st.i !== "number") i = 0;
  else if (fresh || now - (st.at || 0) > AWAY_MS) i = (st.i + 1) % n;
  else i = st.i % n;
  // Skip features this visitor already uses (watchlist saved, phone alerts on), unless all are skipped.
  for (let k = 0; k < n && !usable(items[i]); k++) i = (i + 1) % n;
  const saved = writeState({ v: 1, i, at: now });
  if (!st && !saved) i = Math.floor(Math.random() * n); // storage blocked: vary it instead
  return i;
}

function slide(it, i, n) {
  const cta = it.ask
    ? `<button type="button" class="btn btn-amber btn-sm" data-ask="${esc(it.ask)}">${esc(it.cta)}</button>`
    : `<a class="btn btn-amber btn-sm" href="${esc(it.href)}">${esc(it.cta)} <span aria-hidden="true">&rarr;</span></a>`;
  return `<div class="nest-slide" data-key="${esc(it.key)}">
      <p class="nest-tag"><span>${String(i + 1).padStart(2, "0")}</span>${esc(it.tag)}</p>
      <h3 class="nest-title">${esc(it.title)}</h3>
      <p class="nest-text">${esc(it.text)}</p>
      <div class="nest-cta">${cta}</div>
    </div>`;
}

export function mountNest(root = document.querySelector("[data-nest]")) {
  if (!root) return;
  const items = ITEMS;
  const n = items.length;
  let i = pick(items);
  root.hidden = false;
  root.innerHTML = `<div class="wrap"><div class="nest panel">
      <header class="nest-head">
        <div><h2 class="nest-name">Gator Nest</h2><p class="nest-meta">New on Gator Eyes this week · <span data-nest-pos></span></p></div>
        <div class="nest-nav">
          <div class="nest-dots" role="group" aria-label="Choose a feature">${items.map((it, k) => `<button type="button" data-nest-go="${k}" aria-label="${esc(it.tag)}"></button>`).join("")}</div>
          <button type="button" class="nest-arrow" data-nest-step="-1" aria-label="Previous feature">&larr;</button>
          <button type="button" class="nest-arrow" data-nest-step="1" aria-label="Next feature">&rarr;</button>
        </div>
      </header>
      <div class="nest-grid">
        <div class="nest-body" data-nest-body aria-live="polite"></div>
        <div class="nest-next"><p class="nest-next-h">Up next</p><ol data-nest-next></ol></div>
      </div>
    </div></div>`;
  const body = root.querySelector("[data-nest-body]");
  const pos = root.querySelector("[data-nest-pos]");
  const nextEl = root.querySelector("[data-nest-next]");
  const show = (k, remember) => {
    i = (k + n) % n;
    body.innerHTML = slide(items[i], i, n);
    pos.textContent = `${i + 1} of ${n}`;
    nextEl.innerHTML = [1, 2, 3].map((d) => {
      const k = (i + d) % n;
      return `<li><button type="button" data-nest-go="${k}"><span>${String(k + 1).padStart(2, "0")}</span>${esc(items[k].title)}</button></li>`;
    }).join("");
    root.querySelectorAll(".nest-dots [data-nest-go]").forEach((b, x) => b.setAttribute("aria-current", x === i ? "true" : "false"));
    // Browsing moves the rotation too, so the next visit continues from here.
    if (remember) writeState({ v: 1, i, at: Date.now() });
  };
  root.addEventListener("click", (e) => {
    const step = e.target.closest("[data-nest-step]");
    const go = e.target.closest("[data-nest-go]");
    if (step) show(i + Number(step.dataset.nestStep), true);
    else if (go) show(Number(go.dataset.nestGo), true);
  });
  show(i, false);
}

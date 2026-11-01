// Data layer. Everything the site shows comes through here, so a future
// dashboard can add views without touching how data is fetched.
import { CONFIG } from "./config.js?v=20261101r";

const listeners = new Set();
let last = null;
let lastError = null;
let timer = null;

/** Force any solada.fun link to carry the Gator Eyes referral code. */
export function withRef(url) {
  try {
    const u = new URL(url, CONFIG.solada);
    if (/(^|\.)solada\.fun$/.test(u.hostname)) {
      u.searchParams.set("r", CONFIG.ref);
      return u.toString();
    }
    return u.toString();
  } catch {
    return url;
  }
}

export const SNEK_SITE = "https://www.snek.fun";
export const isSnek = (id) => typeof id === "string" && id.startsWith("snek:");

/** Coin page for a token id: Solada.fun with the referral code, or Snek.fun for snek: ids. */
export function coinUrl(tokenId) {
  if (isSnek(tokenId)) return SNEK_SITE + "/token/" + tokenId.slice(5).replace(".", "");
  if (tokenId && tokenId === CONFIG.watchToken && CONFIG.watchSlug) tokenId = CONFIG.watchSlug;
  const path = !tokenId || tokenId === "SOLADA" ? "/" : "/coin/" + encodeURIComponent(tokenId);
  return withRef(CONFIG.solada + path);
}

export const joinUrl = () => withRef(CONFIG.solada + "/");

let extra = {};
/** Extra query params for the feed, e.g. { coin: "draft-gaey" } for one coin's numbers. */
export function setFeedParams(p) {
  extra = p || {};
}

function feedSource() {
  // ?feed=<url> lets you point a page at another copy of the bot (handy for testing).
  const p = new URLSearchParams(location.search).get("feed");
  const u = new URL(p || CONFIG.feedUrl, location.href);
  for (const [k, v] of Object.entries(extra)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

export async function fetchFeed() {
  let r = await fetch(feedSource(), { cache: "no-store" });
  if (r.status === 429) {
    // Busy: wait a moment and try once more before showing an error.
    await new Promise((ok) => setTimeout(ok, 20000));
    r = await fetch(feedSource(), { cache: "no-store" });
  }
  if (!r.ok) throw new Error("Feed returned HTTP " + r.status);
  const j = await r.json();
  if (!j || !Array.isArray(j.alerts)) throw new Error("Feed is missing alerts");
  return normalize(j);
}

// Older alerts were worded "DEV SELL". Show them with the current neutral wording.
function neutral(a) {
  if (a.kind !== "dev") return a.desc ? { desc: a.desc.replace("**launcher wallet**", "creator wallet") } : {};
  return {
    title: (a.title || "").replace(/^DEV SELL/, "CREATOR WALLET SOLD"),
    desc: (a.desc || "").replace("The wallet that launched", "The wallet that created").replace(" just sold ", " sold ").replace("Dev wallet:", "Creator wallet:").replace("**dev has sold**", "creator wallet has sold some"),
  };
}

export const RULES_DEFAULT = { bigUsd: 1000, bigAda: 5200, mcapPct: 7.5, mcapMinAda: 250, spikeMinAda: 1500, spikeMult: 4, spikeWindowMin: 15, creatorMinAda: 500, creatorMcapPct: 5, launchMinAda: 1000, launchMinBuyers: 8, launchWindowMin: 60, recapHourET: 0, recapMinET: 1, refreshMin: 1, snek: { bigUsd: 1000, bigAda: 5200 } };

function normalize(j) {
  const rate = Number(j.adaUsd) || null;
  const alerts = j.alerts.map((a) => ({ ...a, ...neutral(a), src: a.src === "snek" ? "snek" : "solada", url: a.url ? withRef(a.url) : coinUrl(a.tokenId) }));
  const snek = j.snek && (j.snek.today || (j.snek.recaps || []).length) ? { today: j.snek.today || null, recaps: j.snek.recaps || [] } : null;
  return {
    updatedAt: j.updatedAt ? new Date(j.updatedAt) : null,
    rate,
    alerts,
    today: j.today || null,
    recaps: j.recaps || [],
    // Last 40 trades, newest first (the running ticker) and the last few posted weeks.
    tape: Array.isArray(j.tape) ? j.tape : [],
    weeks: Array.isArray(j.weeks) ? j.weeks : [],
    watch: j.watch || null,
    lastFailAt: j.lastFailAt ? new Date(j.lastFailAt) : null,
    rules: { ...RULES_DEFAULT, ...(j.rules || {}), snek: { ...RULES_DEFAULT.snek, ...((j.rules && j.rules.snek) || {}) } },
    coin: j.coin || null,
    // Snek.fun's own daily tallies (sibling of today/recaps, which stay Solada-only).
    snek,
    sources: j.sources || { solada: { name: "Solada", on: true } },
  };
}

async function tick() {
  try {
    last = await fetchFeed();
    lastError = null;
  } catch (e) {
    lastError = e;
  }
  for (const fn of listeners) fn(last, lastError);
}

/** Subscribe to feed updates. Starts polling on first subscriber. */
export function subscribe(fn) {
  listeners.add(fn);
  if (last || lastError) fn(last, lastError);
  if (!timer) {
    tick();
    timer = setInterval(() => {
      if (document.visibilityState === "visible") tick();
    }, CONFIG.refreshMs);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") tick();
    });
  }
  return () => listeners.delete(fn);
}

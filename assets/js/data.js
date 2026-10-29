// Data layer. Everything the site shows comes through here, so a future
// dashboard can add views without touching how data is fetched.
import { CONFIG } from "./config.js?v=20261029e";

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

export function coinUrl(tokenId) {
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
  const r = await fetch(feedSource(), { cache: "no-store" });
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

export const RULES_DEFAULT = { bigAda: 1000, mcapPct: 5, mcapMinAda: 250, spikeMinAda: 1500, spikeMult: 4, spikeWindowMin: 15, creatorMinAda: 100, launchMinAda: 1000, launchMinBuyers: 8, launchWindowMin: 60, recapHourET: 9, refreshMin: 2 };

function normalize(j) {
  const rate = Number(j.adaUsd) || null;
  const alerts = j.alerts.map((a) => ({ ...a, ...neutral(a), url: a.url ? withRef(a.url) : coinUrl(a.tokenId) }));
  return {
    updatedAt: j.updatedAt ? new Date(j.updatedAt) : null,
    rate,
    alerts,
    today: j.today || null,
    recaps: j.recaps || [],
    watch: j.watch || null,
    lastFailAt: j.lastFailAt ? new Date(j.lastFailAt) : null,
    rules: { ...RULES_DEFAULT, ...(j.rules || {}) },
    coin: j.coin || null,
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

// Gator Eyes web app: registers the service worker on every page, keeps phone alerts in
// step with the watchlist, and holds the shared alert helpers used by app.html.
import { CONFIG } from "./config.js?v=20261101r";
import * as watchlist from "./watchlist.js?v=20261101r";

const PREFS = "ge-push";
export const KINDS = [
  { k: "big", label: "Whale trades", hint: "Big buys and sells, $1,000+ worth of ADA or a big slice of the coin's market cap" },
  { k: "spike", label: "Volume spikes", hint: "A coin suddenly trading many times its normal pace" },
  { k: "dev", label: "Creator sells", hint: "The wallet that launched a coin selling a meaningful amount" },
  { k: "launch", label: "Fast launches", hint: "New coins pulling in real buying in their first hour" },
  { k: "watch", label: "$GAEY trades", hint: "Every $GAEY buy and sell" },
];
export const DEFAULT_PREFS = { kinds: ["big", "spike", "dev", "launch"], src: ["solada", "snek"], watchOnly: false };

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(navigator.userAgent);
export const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export function savedPrefs() {
  try {
    const j = JSON.parse(localStorage.getItem(PREFS) || "null");
    if (j && Array.isArray(j.kinds)) return { ...DEFAULT_PREFS, ...j };
  } catch {}
  return null;
}
function storePrefs(p) {
  try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch {}
}
function forgetPrefs() {
  try { localStorage.removeItem(PREFS); } catch {}
}

let regP = null;
export function registration() {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  if (!regP) regP = navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => null);
  return regP;
}

export async function currentSub() {
  const reg = await registration();
  if (!reg || !reg.pushManager) return null;
  try { return await reg.pushManager.getSubscription(); } catch { return null; }
}

function keyBytes(b64) {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function post(path, body) {
  const r = await fetch(CONFIG.pushUrl + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) throw new Error(j.error || "The alert server answered " + r.status + ".");
  return j;
}

const watchIds = () => watchlist.list().map((x) => x.id);
const sig = (p) => JSON.stringify([p.kinds, p.src, p.watchOnly, p.watchOnly ? watchIds() : []]);

/** Ask for permission (must be called straight from a tap), subscribe and save choices. */
export async function enable(prefs) {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error(perm === "denied"
    ? "Notifications are blocked for Gator Eyes. Turn them on in your phone's Settings, then try again."
    : "Notifications weren't allowed. Tap the button again and choose Allow.");
  const reg = await registration();
  if (!reg) throw new Error("This browser can't run the Gator Eyes app.");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(CONFIG.pushKey) });
  return save(prefs, sub);
}

/** Send the current choices for an existing subscription. */
export async function save(prefs, sub) {
  sub = sub || (await currentSub());
  if (!sub) throw new Error("Alerts aren't on for this device yet.");
  const p = { kinds: prefs.kinds, src: prefs.src, watchOnly: !!prefs.watchOnly };
  await post("/subscribe", { sub: sub.toJSON(), prefs: { ...p, watch: watchIds() } });
  storePrefs({ ...p, synced: sig(p) });
  return p;
}

export async function disable() {
  const sub = await currentSub();
  if (sub) {
    try { await post("/unsubscribe", { endpoint: sub.endpoint }); } catch {}
    try { await sub.unsubscribe(); } catch {}
  }
  forgetPrefs();
}

export async function test() {
  const sub = await currentSub();
  if (!sub) throw new Error("Alerts aren't on for this device yet.");
  return post("/test", { sub: sub.toJSON() });
}

// If "only my watchlist" is on, send the new list whenever coins are starred or removed.
async function syncWatchlist() {
  const p = savedPrefs();
  if (!p || !p.watchOnly || p.synced === sig(p)) return;
  if (!pushSupported() || Notification.permission !== "granted") return;
  try { await save(p); } catch {}
}

// In the installed app, a one-time nudge to turn alerts on.
function nudge() {
  if (!isStandalone() || !pushSupported() || location.pathname.endsWith("/app.html")) return;
  if (savedPrefs() || Notification.permission === "denied") return;
  try { if (localStorage.getItem("ge-push-nudge")) return; } catch {}
  const bar = document.createElement("div");
  bar.className = "app-nudge";
  bar.setAttribute("role", "status");
  bar.innerHTML = '<span>Get Gator Eyes alerts as phone notifications.</span><a class="btn btn-amber btn-sm" href="./app.html">Turn on alerts</a><button type="button" class="app-nudge-x" aria-label="Not now">&times;</button>';
  bar.querySelector("button").addEventListener("click", () => {
    bar.remove();
    try { localStorage.setItem("ge-push-nudge", String(Date.now())); } catch {}
  });
  document.body.appendChild(bar);
}

export function mountPwa() {
  if (!("serviceWorker" in navigator)) return;
  registration();
  if (navigator.clearAppBadge && isStandalone()) navigator.clearAppBadge().catch(() => {});
  syncWatchlist();
  watchlist.on(() => setTimeout(syncWatchlist, 500));
  nudge();
}

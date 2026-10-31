// Tokens table: every coin on Solada.fun with windowed volume, net flow,
// price change, graduation progress and each coin's Gator Eyes alerts.
import { getApi } from "./api.js?v=20261031z";
import { fetchFeed } from "./data.js?v=20261031z";
import { timeAgo } from "./ui.js?v=20261031z";
import { wireLinks, liveStatus } from "./common.js?v=20261031z";
import * as platform from "./platform.js?v=20261031z";
import * as watchlist from "./watchlist.js?v=20261031z";
import { coinRow } from "./coinrow.js?v=20261031z";

wireLinks();
platform.mount();
watchlist.wire();
watchlist.on(() => { if (st.f === "watch") render(); });
platform.on(() => { st.all = false; render(); });
const $ = (s) => document.querySelector(s);
const rowsEl = $("[data-rows]"), moreBtn = $("[data-more]"), notice = $("[data-notice]");
const params = new URLSearchParams(location.search);
const FILTERS = ["all", "curve", "grad", "alerts", "watch"];
const st = { win: params.get("w") || "h24", sort: "v", dir: -1, f: FILTERS.includes(params.get("f")) ? params.get("f") : "all", q: (params.get("q") || "").trim(), quiet: false, all: false, data: null };
document.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("is-on", x.dataset.f === st.f));
if (st.q) $("[data-search]").value = st.q;

function val(c, k) {
  const w = c.w[st.win] || {};
  switch (k) {
    case "price": return c.price ?? -1;
    case "ch": return w.ch ?? -1e9;
    case "v": return w.v || 0;
    case "n": return w.n || 0;
    case "net": return w.net || 0;
    case "mc": return c.mc || 0;
    case "prog": return c.cs === "open" ? c.prog || 0 : c.cs === "graduated" ? 10001 : -1;
    case "al": return Object.values(c.al || {}).reduce((a, b) => a + b, 0);
  }
  return 0;
}

function render() {
  if (!st.data) return;
  const q = st.q.toLowerCase();
  let list = st.data.coins.filter((c) => {
    if (!platform.inScope(c)) return false;
    if (q && !((c.tk || "").toLowerCase().includes(q) || (c.name || "").toLowerCase().includes(q) || c.id.toLowerCase() === q || (c.slug || "").toLowerCase() === q)) return false;
    if (st.f === "curve" && c.cs !== "open") return false;
    if (st.f === "grad" && c.cs !== "graduated") return false;
    if (st.f === "alerts" && !Object.keys(c.al || {}).length) return false;
    if (st.f === "watch") return watchlist.has(c.id);
    if (!st.quiet && !q && !(c.w[st.win] && c.w[st.win].n)) return false;
    return true;
  });
  list.sort((a, b) => (val(a, st.sort) - val(b, st.sort)) * st.dir || (val(b, "v") - val(a, "v")));
  const shown = st.all ? list : list.slice(0, 50);
  const lp = platform.get();
  let emptyMsg = st.win === "live" ? "No trades in the last 15 minutes." : lp === "all" ? "No coins match." : `No ${platform.label(lp)} coins match.`;
  let emptyHint = lp === "all" ? "Try a longer window or include quiet coins." : `Try a longer window, include quiet coins, or <button type="button" class="link" data-platform="all">show all launchpads</button>.`;
  if (st.f === "watch") {
    const n = watchlist.count();
    emptyMsg = n ? (lp === "all" ? "None of your starred coins are in the live list right now." : `None of your starred coins are on ${platform.label(lp)}.`) : "You haven't starred any coins yet.";
    emptyHint = n ? `See them all on your <a href="./watchlist.html">Watchlist</a>.` : "Tap the star next to a coin to save it in this browser. No sign-up, no wallet.";
  }
  rowsEl.innerHTML = shown.length ? shown.map((c) => coinRow(c, { win: st.win, rate: st.data.adaUsd, showPill: platform.get() === "all" })).join("") : `<tr><td colspan="11"><div class="empty"><p>${emptyMsg} ${emptyHint}</p></div></td></tr>`;
  watchlist.wire();
  moreBtn.hidden = st.all || list.length <= 50;
  moreBtn.textContent = `Show all ${list.length} coins`;
  $("[data-updated]").textContent = st.data.updatedAt ? "Updated " + timeAgo(Date.parse(st.data.updatedAt)) + "." : "";
}

document.querySelectorAll("[data-win]").forEach((b) => {
  b.classList.toggle("is-on", b.dataset.win === st.win);
  b.addEventListener("click", () => {
    st.win = b.dataset.win;
    document.querySelectorAll("[data-win]").forEach((x) => { x.classList.toggle("is-on", x === b); x.setAttribute("aria-selected", x === b); });
    render();
  });
});
document.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => {
  st.f = b.dataset.f;
  document.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("is-on", x === b));
  render();
}));
document.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => {
  if (st.sort === b.dataset.sort) st.dir *= -1; else { st.sort = b.dataset.sort; st.dir = -1; }
  document.querySelectorAll("[data-sort]").forEach((x) => x.classList.toggle("is-on", x === b));
  render();
}));
$("[data-search]").addEventListener("input", (e) => { st.q = e.target.value.trim(); render(); });
$("[data-quiet]").addEventListener("change", (e) => { st.quiet = e.target.checked; render(); });
moreBtn.addEventListener("click", () => { st.all = true; render(); });

rowsEl.innerHTML = Array.from({ length: 8 }, () => `<tr><td colspan="11"><div class="skel-block" style="min-height:36px"></div></td></tr>`).join("");

// Which launchpads the worker watches, read once from the feed so the status line is right even on a quiet Snek.fun day.
let srcCache = null;
async function sources(coins) {
  if (!srcCache) { try { srcCache = (await fetchFeed()).sources || null; } catch {} }
  return srcCache || { snek: { on: (coins || []).some((c) => c.src === "snek") } };
}

async function load() {
  try {
    const j = await getApi("/tokens");
    st.data = j;
    notice.hidden = true;
    liveStatus({ updatedAt: new Date(j.updatedAt), sources: await sources(j.coins) });
    render();
  } catch (e) {
    liveStatus(null, e);
    if (!st.data) {
      notice.hidden = false;
      notice.innerHTML = "<strong>Can't reach the Gator Eyes feed right now.</strong> It will retry in a minute.";
      rowsEl.innerHTML = "";
    }
  }
}
load();
setInterval(load, 60000);

// Watchlist page: the coins saved in this browser, with their live numbers from
// /tokens and every recent alert on them from /feed.
import { getApi } from "./api.js?v=20261101q";
import { fetchFeed } from "./data.js?v=20261101q";
import { esc, fmt, usdcx, usdcxSigned, timeAgo, alertCard, emptyState, skeleton } from "./ui.js?v=20261101q";
import { wireLinks, liveStatus } from "./common.js?v=20261101q";
import * as platform from "./platform.js?v=20261101q";
import * as watchlist from "./watchlist.js?v=20261101q";
import { coinRow, missingRow } from "./coinrow.js?v=20261101q";

wireLinks();
platform.mount();
watchlist.wire();

const $ = (s) => document.querySelector(s);
const rowsEl = $("[data-rows]"), notice = $("[data-notice]"), importEl = $("[data-import]"), alertsEl = $("[data-alerts]"), kpis = $("[data-kpis]");
const params = new URLSearchParams(location.search);
const st = { win: ["live", "h1", "h6", "h24"].includes(params.get("w")) ? params.get("w") : "h24", sort: "v", dir: -1, data: null, feed: null };

const signedAda = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));

function val(c, k) {
  const w = (c.w && c.w[st.win]) || {};
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

/** Saved coins joined with live rows. Returns { live: [coin rows], missing: [saved snapshots] }. */
function joined() {
  const saved = watchlist.list();
  const by = new Map(((st.data && st.data.coins) || []).map((c) => [c.id, c]));
  const live = [], missing = [];
  for (const x of saved) {
    const c = by.get(x.id);
    if (c) live.push(c); else missing.push(x);
  }
  return { live, missing, saved };
}

function renderKpis(live) {
  const scoped = live.filter(platform.inScope);
  const rate = st.data && st.data.adaUsd;
  let v = 0, net = 0, al = 0, active = 0;
  for (const c of scoped) {
    const w = (c.w && c.w[st.win]) || {};
    v += w.v || 0; net += w.net || 0;
    if (w.n) active++;
    al += Object.values(c.al || {}).reduce((a, b) => a + b, 0);
  }
  const winLabel = { live: "last 15 min", h1: "last hour", h6: "last 6 hours", h24: "last 24 hours" }[st.win];
  const n = watchlist.count();
  kpis.hidden = !n;
  $("[data-k=n]").textContent = fmt(n);
  $("[data-k=nsub]").textContent = n ? `${active} traded in the ${winLabel}` : "";
  $("[data-k=v]").textContent = fmt(v) + " ADA";
  $("[data-k=vsub]").textContent = usdcx(v, rate) + " · " + winLabel;
  const netEl = $("[data-k=net]");
  netEl.textContent = signedAda(net) + " ADA";
  netEl.className = "kpi-value " + (net > 0 ? "pos" : net < 0 ? "neg" : "");
  $("[data-k=netsub]").textContent = usdcxSigned(net, rate) + " · bought minus sold";
  $("[data-k=al]").textContent = fmt(al);
  $("[data-k=alsub]").textContent = al ? "on your coins" : "nothing flagged";
}

function renderRows() {
  if (!st.data) return;
  const { live, missing, saved } = joined();
  watchlist.refresh(live);
  $("[data-clear]").hidden = !saved.length;
  const lp = platform.get();
  let list = live.filter(platform.inScope);
  list.sort((a, b) => (val(a, st.sort) - val(b, st.sort)) * st.dir || (val(b, "v") - val(a, "v")));
  const miss = missing.filter(platform.inScope);
  const html = list.map((c) => coinRow(c, { win: st.win, rate: st.data.adaUsd, showPill: lp === "all", more: true })).join("") + miss.map((x) => missingRow(x)).join("");
  const emptyEl = $("[data-empty]"), tableWrap = rowsEl.closest(".table-wrap");
  if (!html) {
    const msg = !saved.length ? "Nothing starred yet." : `None of your starred coins are on ${platform.label(lp)}.`;
    const hint = !saved.length
      ? ` Tap the star next to any coin on the <a href="./tokens.html">Tokens</a> page, or type a ticker in the box above. The list is saved in this browser, no sign-up.`
      : ` <button type="button" class="link" data-platform="all">Show all launchpads</button>.`;
    emptyEl.innerHTML = emptyState(msg, hint);
  }
  emptyEl.hidden = !!html;
  tableWrap.hidden = !html;
  rowsEl.innerHTML = html;
  watchlist.wire();
  renderKpis(live);
  $("[data-sub]").innerHTML = saved.length
    ? `${saved.length} coin${saved.length === 1 ? "" : "s"} saved in this browser.${missing.length ? ` ${missing.length} not in the live list right now.` : ""} Un-star a coin to remove it.`
    : `Star coins on the <a href="./tokens.html">Tokens</a> page or add one here.`;
  $("[data-updated]").textContent = st.data.updatedAt ? "Updated " + timeAgo(Date.parse(st.data.updatedAt)) + "." : "";
  const fu = $("[data-fu-link]");
  const tks = list.map((c) => c.tk).filter(Boolean);
  fu.href = tks.length === 1 ? `./followup.html?coin=${encodeURIComponent(tks[0])}` : "./followup.html";
}

function renderAlerts() {
  if (!st.feed) return;
  const ids = new Set(watchlist.ids());
  if (!ids.size) { alertsEl.innerHTML = emptyState("Alerts on your starred coins will show up here."); return; }
  const mine = st.feed.alerts.filter((a) => ids.has(a.tokenId) && platform.inScope(a));
  if (!mine.length) {
    const any = st.feed.alerts.filter((a) => ids.has(a.tokenId)).length;
    alertsEl.innerHTML = emptyState(any ? `No alerts on your ${platform.label(platform.get())} coins in the recent feed.` : "Quiet so far. None of your coins set off a whale, spike, fast-launch or creator-sell alert in the recent feed.", any ? ` <button type="button" class="link" data-platform="all">Show all launchpads</button>.` : "");
    return;
  }
  alertsEl.innerHTML = mine.slice(0, 30).map(alertCard).join("");
}

function render() { renderRows(); renderAlerts(); }

/* ---------- add a coin by ticker or name ---------- */
const addIn = $("[data-add-input]"), matchesEl = $("[data-add-matches]");
let hi = -1;
function matches() {
  const q = addIn.value.trim().toLowerCase();
  if (!q || !st.data) return [];
  return st.data.coins
    .filter((c) => !watchlist.has(c.id) && ((c.tk || "").toLowerCase().includes(q) || (c.name || "").toLowerCase().includes(q) || (c.slug || "").toLowerCase() === q || c.id.toLowerCase() === q))
    .sort((a, b) => {
      const ax = (a.tk || "").toLowerCase() === q ? 0 : (a.tk || "").toLowerCase().startsWith(q) ? 1 : 2;
      const bx = (b.tk || "").toLowerCase() === q ? 0 : (b.tk || "").toLowerCase().startsWith(q) ? 1 : 2;
      return ax - bx || val(b, "v") - val(a, "v");
    })
    .slice(0, 8);
}
function paintMatches() {
  const m = matches();
  matchesEl.hidden = !m.length && !addIn.value.trim();
  addIn.setAttribute("aria-expanded", String(!matchesEl.hidden));
  if (!m.length) {
    matchesEl.innerHTML = addIn.value.trim() ? `<li class="add-none">No coin matches "${esc(addIn.value.trim())}" in the live list.</li>` : "";
    hi = -1;
    return;
  }
  hi = Math.min(hi, m.length - 1);
  matchesEl.innerHTML = m.map((c, i) => `<li role="option" aria-selected="${i === hi}" class="${i === hi ? "is-hi" : ""}" data-pick="${esc(c.id)}">${c.img ? `<img src="${esc(c.img)}" alt="" width="22" height="22" loading="lazy">` : `<span class="coin-dot"></span>`}<strong>${esc(c.tk || "?")}</strong><span>${esc((c.name || "").slice(0, 28))}</span><em>${c.src === "snek" ? "Snek.fun" : "Solada"}</em></li>`).join("");
}
function pick(id) {
  const c = st.data && st.data.coins.find((x) => x.id === id);
  if (!c) return;
  if (watchlist.add(c) === false) { notice.hidden = false; notice.innerHTML = `<strong>Your watchlist is full</strong> (${watchlist.MAX_ITEMS} coins). Remove one first.`; return; }
  addIn.value = "";
  hi = -1;
  paintMatches();
  render();
}
addIn.addEventListener("input", () => { hi = -1; paintMatches(); });
addIn.addEventListener("focus", paintMatches);
addIn.addEventListener("keydown", (e) => {
  const m = matches();
  if (e.key === "ArrowDown") { e.preventDefault(); hi = Math.min(hi + 1, m.length - 1); paintMatches(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); hi = Math.max(hi - 1, 0); paintMatches(); }
  else if (e.key === "Enter") { e.preventDefault(); const c = m[hi >= 0 ? hi : 0]; if (c) pick(c.id); }
  else if (e.key === "Escape") { matchesEl.hidden = true; addIn.setAttribute("aria-expanded", "false"); }
});
matchesEl.addEventListener("mousedown", (e) => { const li = e.target.closest("[data-pick]"); if (li) { e.preventDefault(); pick(li.dataset.pick); } });
document.addEventListener("click", (e) => { if (!e.target.closest("[data-add]")) { matchesEl.hidden = true; addIn.setAttribute("aria-expanded", "false"); } });

/* ---------- share, clear, import from a link ---------- */
$("[data-share]").addEventListener("click", async (e) => {
  const b = e.currentTarget;
  if (!watchlist.count()) { b.textContent = "Star a coin first"; setTimeout(() => (b.textContent = "Copy link to this list"), 2000); return; }
  const url = watchlist.shareUrl();
  try {
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) await navigator.share({ title: "My Gator Eyes watchlist", url });
    else { await navigator.clipboard.writeText(url); b.textContent = "Link copied"; setTimeout(() => (b.textContent = "Copy link to this list"), 2000); }
  } catch {
    prompt("Copy this link:", url);
  }
});
$("[data-clear]").addEventListener("click", () => {
  if (confirm(`Remove all ${watchlist.count()} coins from your watchlist on this device?`)) { watchlist.clear(); render(); }
});

function offerImport() {
  const incoming = watchlist.fromLink();
  if (!incoming.length) { importEl.hidden = true; return; }
  const by = new Map(((st.data && st.data.coins) || []).map((c) => [c.id, c]));
  const names = incoming.map((id) => (by.get(id) || {}).tk).filter(Boolean);
  importEl.hidden = false;
  importEl.innerHTML = `<strong>This link carries ${incoming.length} coin${incoming.length === 1 ? "" : "s"}</strong>${names.length ? ` (${names.map((t) => "$" + esc(t)).join(", ")})` : ""} that aren't on your list yet. <span class="notice-actions"><button type="button" class="btn btn-sm btn-amber" data-import-add>Add them</button> <button type="button" class="btn btn-sm btn-ghost" data-import-skip>No thanks</button></span>`;
  importEl.querySelector("[data-import-add]").addEventListener("click", () => {
    for (const id of incoming) watchlist.add(by.get(id) || id);
    finishImport();
    render();
  });
  importEl.querySelector("[data-import-skip]").addEventListener("click", finishImport);
}
function finishImport() {
  importEl.hidden = true;
  const u = new URL(location.href); u.searchParams.delete("w"); history.replaceState(null, "", u);
}

/* ---------- controls ---------- */
document.querySelectorAll("[data-win]").forEach((b) => {
  b.classList.toggle("is-on", b.dataset.win === st.win);
  b.setAttribute("aria-selected", String(b.dataset.win === st.win));
  b.addEventListener("click", () => {
    st.win = b.dataset.win;
    document.querySelectorAll("[data-win]").forEach((x) => { x.classList.toggle("is-on", x === b); x.setAttribute("aria-selected", String(x === b)); });
    renderRows();
  });
});
document.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => {
  if (st.sort === b.dataset.sort) st.dir *= -1; else { st.sort = b.dataset.sort; st.dir = -1; }
  document.querySelectorAll("[data-sort]").forEach((x) => x.classList.toggle("is-on", x === b));
  renderRows();
}));
platform.on(render);
watchlist.on(render);

const pn = $("[data-persist-note]");
if (!watchlist.isPersistent()) pn.textContent = "Heads up: this browser is blocking site storage, so the list only lasts for this visit.";

rowsEl.innerHTML = Array.from({ length: Math.max(2, Math.min(6, watchlist.count() || 2)) }, () => `<tr><td colspan="11"><div class="skel-block" style="min-height:36px"></div></td></tr>`).join("");
alertsEl.innerHTML = skeleton(2);

async function load() {
  try {
    const [tok, feed] = await Promise.all([getApi("/tokens"), fetchFeed().catch(() => null)]);
    st.data = tok;
    if (feed) st.feed = feed;
    notice.hidden = true;
    liveStatus(feed || { updatedAt: new Date(tok.updatedAt), sources: null }, null);
    offerImport();
    render();
    if (!feed) alertsEl.innerHTML = emptyState("Couldn't load recent alerts just now. They'll be back on the next refresh.");
  } catch (e) {
    liveStatus(null, e);
    if (!st.data) {
      notice.hidden = false;
      notice.innerHTML = "<strong>Can't reach the Gator Eyes feed right now.</strong> It will retry in a minute.";
      rowsEl.innerHTML = "";
      alertsEl.innerHTML = "";
    }
  }
}
load();
setInterval(() => { if (document.visibilityState === "visible") load(); }, 60000);

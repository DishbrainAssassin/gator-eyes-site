// Holder rewards: what every Solada coin pays its holders, the tokens those rewards are paid in, and an
// estimate of what a pasted wallet's bags earned. Figures come from the worker's /rewards (daily snapshots of
// Solada's own lifetime totals), /dups and /bag. Nothing here connects a wallet or saves an address.
import { getApi } from "./api.js?v=20261102-usdcx2";
import { coinUrl } from "./data.js?v=20261102-usdcx2";
import { esc, fmt, compact, timeAgo } from "./ui.js?v=20261102-usdcx2";
import { wireLinks } from "./common.js?v=20261113-toolsmenu";
import { loadDups, dupTag } from "./dups.js?v=20261117-rewards";

wireLinks();
const $ = (s) => document.querySelector(s);
const st = { data: null, dups: null, view: "coins", q: "", stage: "", sort: "dw", dir: -1, more: false, bag: null, err: null };
const MAX_ROWS = 25;

const adaTxt = (v, unit = true) => {
  if (v == null) return "–";
  const s = v >= 1e4 ? compact(Math.round(v)) : v >= 100 ? fmt(Math.round(v)) : v >= 1 ? fmt(v, 1) : v > 0 ? (v >= 0.01 ? fmt(v, 2) : "<0.01") : "0";
  return s + (unit ? " ADA" : "");
};
const usd = (v) => (v != null && v >= 1 && st.data && st.data.adaUsd ? `<small class="cell-sub">~${fmt(v * st.data.adaUsd, v * st.data.adaUsd < 10 ? 2 : 0)} USDCx</small>` : "");
const dayTxt = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "–");
const span = () => (st.data && st.data.spanDays ? st.data.spanDays : 0);
const spanLabel = () => (span() ? `Last ${span()} day${span() === 1 ? "" : "s"}` : "This week");
const shareTxt = (bps) => (bps == null ? "–" : (bps / 100).toFixed(bps % 100 ? 1 : 0) + "%");

function coinCell(c) {
  const img = c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'coin-dot'}))">` : `<span class="coin-dot"></span>`;
  const name = c.name && c.name.replace(/^\$/, "").toLowerCase() !== String(c.tk || "").toLowerCase() ? c.name : "";
  const stage = c.grad ? "" : ` <span class="rw-stage">On the curve</span>`;
  return `<span class="coin-cell">${img}<span><a href="${esc(coinUrl(c.slug || c.id))}" target="_blank" rel="noopener">$${esc(c.tk || "?")}</a>${stage}${name ? `<br><small class="cell-sub">${esc(name)}</small>` : ""}${c.dup ? dupTag(st.dups, c.tk, c.id) : ""}</span></span>`;
}
const paidIn = (ru) => (ru && ru.length ? ru.map((t) => `<span class="rw-tok">${esc(t)}</span>`).join("") : "–");

function kpis() {
  const d = st.data, t = d.tot;
  $("[data-kpis]").innerHTML = [
    ["Paid to holders, all time", adaTxt(t.life), `across ${fmt(t.coins)} coins · Solada's own totals`],
    [d.prevDay ? `Yesterday (${dayTxt(d.prevDay)})` : "Yesterday", t.d1 == null ? "–" : adaTxt(t.d1), d.prevDay ? "midnight to midnight ET" : "needs two saved days"],
    [spanLabel(), t.dw == null ? "–" : adaTxt(t.dw), d.weekFrom ? `since ${dayTxt(d.weekFrom)}` : "collecting"],
    ["Today so far", t.today == null ? "–" : adaTxt(t.today), t.today == null ? "live figure unavailable" : "since midnight ET"],
    ["Coins sharing with holders", fmt(t.paying), t.burnRoute ? `${fmt(t.burnRoute)} more send rewards to buyback and burn` : "holder share set by the launcher"]
  ].map(([l, v, s]) => `<div class="kpi"><span class="kpi-label">${esc(l)}</span><span class="kpi-value">${v}</span><span class="kpi-sub">${esc(s)}</span></div>`).join("");
}

function sorted(list) {
  const k = st.sort, dir = st.dir;
  return list.slice().sort((a, b) => ((a[k] ?? -1) - (b[k] ?? -1)) * dir || (b.life - a.life));
}
function matches(c) {
  if (st.stage === "grad" && !c.grad) return false;
  if (st.stage === "curve" && c.grad) return false;
  if (!st.q) return true;
  const q = st.q.toLowerCase().replace(/^\$/, "");
  return (c.tk || "").toLowerCase().includes(q) || (c.name || "").toLowerCase().includes(q) || (c.ru || []).some((t) => t.toLowerCase() === q) || c.id === st.q;
}

function renderCoins() {
  const d = st.data;
  const all = d.coins.filter((c) => c.hs > 0 || c.life > 0);
  const list = sorted(all.filter(matches));
  const rows = st.more || st.q ? list : list.slice(0, MAX_ROWS);
  $("[data-head-dw]").textContent = spanLabel();
  $("[data-coins-meta]").textContent = `${fmt(list.length)} coin${list.length === 1 ? "" : "s"}${st.q || st.stage ? " match" : " that share rewards with holders or have paid them"} · Snapshot ${dayTxt(d.day)}, updated ${timeAgo(d.at)}`;
  $("[data-coin-rows]").innerHTML = rows.length ? rows.map((c) => `<tr>
      <td>${coinCell(c)}</td>
      <td class="num hide-sm">${shareTxt(c.hs)}</td>
      <td>${paidIn(c.ru)}<small class="cell-sub rw-sm">${shareTxt(c.hs)} to holders</small></td>
      <td class="num hide-sm">${adaTxt(c.d1)}</td>
      <td class="num"><strong>${adaTxt(c.dw)}</strong>${usd(c.dw)}<small class="cell-sub rw-sm">${adaTxt(c.life)} all time</small></td>
      <td class="num hide-sm" title="ADA paid to holders per 1,000 ADA of market cap, scaled to 7 days">${c.per1k == null ? "–" : fmt(c.per1k, c.per1k < 10 ? 2 : 1)}</td>
      <td class="num hide-sm">${adaTxt(c.life)}</td>
    </tr>`).join("") : `<tr><td colspan="7"><p class="empty">No coins match.</p></td></tr>`;
  const more = $("[data-more]");
  more.hidden = st.more || !!st.q || list.length <= MAX_ROWS;
  more.textContent = `Show all ${fmt(list.length)} coins`;
  document.querySelectorAll("[data-sort]").forEach((b) => { b.classList.toggle("is-on", b.dataset.sort === st.sort); b.setAttribute("aria-sort", b.dataset.sort === st.sort ? (st.dir < 0 ? "descending" : "ascending") : "none"); });
}

function renderTokens() {
  const d = st.data, byId = Object.fromEntries(d.coins.map((c) => [c.id, c]));
  $("[data-head-tdw]").textContent = spanLabel();
  const list = d.tokens.filter((t) => !st.q || t.tk.toLowerCase().includes(st.q.toLowerCase().replace(/^\$/, "")));
  $("[data-tok-meta]").textContent = `${fmt(d.tokens.length)} reward tokens. A coin paying in two tokens counts half its ADA toward each.`;
  $("[data-tok-rows]").innerHTML = list.length ? list.map((t) => `<tr>
      <td><span class="rw-tok is-big">${esc(t.tk)}</span></td>
      <td class="num">${fmt(t.coins)}</td>
      <td class="num hide-sm">${adaTxt(t.d1)}</td>
      <td class="num"><strong>${adaTxt(t.dw)}</strong>${usd(t.dw)}</td>
      <td class="num">${adaTxt(t.life)}</td>
      <td class="hide-sm">${t.top.map((id) => byId[id]).filter(Boolean).map((c) => `<a href="${esc(coinUrl(c.slug || c.id))}" target="_blank" rel="noopener">$${esc(c.tk || "?")}</a>`).join(", ") || "–"}</td>
    </tr>`).join("") : `<tr><td colspan="6"><p class="empty">No reward tokens match.</p></td></tr>`;
}

function render() {
  const n = $("[data-notice]");
  if (!st.data) {
    if (st.err) { n.hidden = false; n.innerHTML = "<strong>Can't load holder rewards right now.</strong> It will retry in a minute."; }
    return;
  }
  n.hidden = true;
  kpis();
  $("[data-view-coins]").hidden = st.view !== "coins";
  $("[data-view-tokens]").hidden = st.view !== "tokens";
  if (st.view === "coins") renderCoins(); else renderTokens();
  const dot = $("[data-live-dot]");
  dot.classList.add("is-live");
  $("[data-live-text]").textContent = "Solada holder rewards · saved daily at midnight ET";
}

// ---- What my bags earned ----
function renderBag() {
  const b = st.bag, box = $("[data-bag-out]");
  if (!b) { box.hidden = true; return; }
  box.hidden = false;
  if (b.err) { box.innerHTML = `<p class="notice" role="status"><strong>Couldn't look that up.</strong> ${esc(b.err)}</p>`; return; }
  const who = b.who.handle ? "$" + b.who.handle : b.who.stake || "This address";
  const sp = b.spanDays ? `last ${b.spanDays} day${b.spanDays === 1 ? "" : "s"}` : "this week";
  const pay = b.rows.filter((r) => r.src === "solada" && r.hs > 0);
  const other = b.rows.filter((r) => !(r.src === "solada" && r.hs > 0));
  const head = b.rows.length
    ? `<p class="bag-sum"><strong>${esc(who)}</strong> holds ${fmt(b.rows.length)} launchpad coin${b.rows.length === 1 ? "" : "s"}, ${fmt(pay.length)} of them sharing rewards with holders. Estimated share of holder rewards: <strong>${adaTxt(b.tot.e1)}</strong> yesterday, <strong>${adaTxt(b.tot.ew)}</strong> in the ${esc(sp)}${b.tot.eToday ? `, ${adaTxt(b.tot.eToday)} so far today` : ""}. Bags worth about ${adaTxt(b.tot.worth)} at today's market caps.</p>`
    : `<p class="bag-sum"><strong>${esc(who)}</strong> doesn't hold any Solada or Snek.fun coins Gator Eyes knows about.</p>`;
  const row = (r) => `<tr>
      <td>${coinCell({ ...r, dup: r.dup })}${r.route === "burn" ? `<span class="rw-sm rw-sm-tok"><span class="rw-tok">Buyback &amp; burn</span></span>` : r.hs > 0 && r.ru && r.ru.length ? `<span class="rw-sm rw-sm-tok">${paidIn(r.ru)}</span>` : ""}</td>
      <td class="num">${r.share != null ? (r.share < 0.01 ? "<0.01%" : fmt(r.share, r.share < 1 ? 3 : 2) + "%") : r.why === "pump" ? `<span title="Pump coins have holders on Cardano and Solana, and Solada doesn't publish the full supply split, so a share can't be worked out from Cardano alone">–</span><small class="cell-sub">Holders on both chains</small>` : "–"}<small class="cell-sub">${r.pctSup != null ? fmt(r.pctSup, r.pctSup < 1 ? 3 : 2) + "% of supply" : r.src === "snek" ? "Snek.fun" : ""}</small></td>
      <td class="num hide-sm">${adaTxt(r.worth)}</td>
      <td class="hide-sm">${r.src === "snek" ? `<small class="cell-sub">Snek.fun doesn't publish holder rewards</small>` : r.route === "burn" ? `<span class="rw-tok">Buyback &amp; burn</span><small class="cell-sub"><a href="./burns.html?coin=${encodeURIComponent(r.tk || r.id)}">See the Burn tracker</a></small>` : r.hs > 0 ? paidIn(r.ru) + `<small class="cell-sub">${shareTxt(r.hs)} to holders</small>` : `<small class="cell-sub">No holder share set</small>`}</td>
      <td class="num hide-sm">${adaTxt(r.e1)}</td>
      <td class="num"><strong>${adaTxt(r.ew)}</strong></td>
    </tr>`;
  box.innerHTML = head + (b.rows.length ? `<div class="table-wrap"><table class="coin-table bag-table"><thead><tr><th scope="col">Coin</th><th scope="col" class="num">Your share</th><th scope="col" class="num hide-sm">Bag ≈</th><th scope="col" class="hide-sm">Paid in</th><th scope="col" class="num hide-sm">Yesterday</th><th scope="col" class="num">${esc(sp.replace(/^l/, "L"))}</th></tr></thead><tbody>${pay.concat(other).map(row).join("")}</tbody></table></div>` : "")
    + `<p class="excl">Estimates, not payout records. Your share is your balance divided by the supply held outside the pool, the curve and the burn address, times what the coin paid all its holders. It assumes you held the same bag the whole time. Solada's own split can differ (locks, the creator's wallet and minimum balances may count differently), and rewards paid in tokens are shown at their ADA value on the day. Nothing you type here is saved.</p>`;
}
async function lookupBag(e) {
  e.preventDefault();
  const v = $("[data-bag-in]").value.trim();
  if (!v) return;
  const btn = $("[data-bag-go]");
  btn.disabled = true; btn.textContent = "Looking…";
  try { st.bag = await getApi("/bag", { who: v }); }
  catch (err) { st.bag = { err: (err && err.message) || "Try again in a minute." }; }
  finally { btn.disabled = false; btn.textContent = "Check bags"; }
  renderBag();
}

async function load() {
  try {
    const [d, dups] = await Promise.all([getApi("/rewards"), loadDups()]);
    st.data = d; st.dups = dups; st.err = null;
  } catch (e) { st.err = e; }
  render();
}

$("[data-views]").addEventListener("click", (e) => {
  const b = e.target.closest("[data-v]");
  if (!b) return;
  st.view = b.dataset.v; st.more = false;
  document.querySelectorAll("[data-views] .tab").forEach((t) => { t.classList.toggle("is-on", t === b); t.setAttribute("aria-selected", t === b); });
  render();
});
$("[data-stages]").addEventListener("click", (e) => {
  const b = e.target.closest("[data-stage]");
  if (!b) return;
  st.stage = b.dataset.stage; st.more = false;
  document.querySelectorAll("[data-stages] .chip").forEach((t) => t.classList.toggle("is-on", t === b));
  render();
});
document.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => {
  if (st.sort === b.dataset.sort) st.dir *= -1; else { st.sort = b.dataset.sort; st.dir = -1; }
  render();
}));
$("[data-search]").addEventListener("input", (e) => { st.q = e.target.value.trim(); st.more = false; render(); });
$("[data-more]").addEventListener("click", () => { st.more = true; render(); });
$("[data-bag-form]").addEventListener("submit", lookupBag);

const params = new URLSearchParams(location.search);
if (params.get("coin")) { st.q = params.get("coin"); $("[data-search]").value = st.q; }
if (params.get("view") === "tokens") document.querySelector('[data-v="tokens"]').click();
await load();
// The KPIs render above the bag form, so a #bag link lands short; settle it once the board is in.
if (location.hash === "#bag") { $("#bag").scrollIntoView({ block: "start" }); $("[data-bag-in]").focus({ preventScroll: true }); }
if (params.get("who")) { $("[data-bag-in]").value = params.get("who"); $("[data-bag-form]").requestSubmit(); }
setInterval(load, 5 * 60000);

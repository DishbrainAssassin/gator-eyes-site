// Liquidity tracker: every graduated Solada coin's Minswap pool and who holds its LP tokens.
import { getApi } from "./api.js?v=20261102-usdcx2";
import { coinUrl } from "./data.js?v=20261102-usdcx2";
import { esc, fmt, compact, timeAgo } from "./ui.js?v=20261102-usdcx2";
import { wireLinks } from "./common.js?v=20261102-usdcx2";

wireLinks();
const $ = (s) => document.querySelector(s);
const st = { days: 7, q: "", removesOnly: false, more: false, moreCoins: false, data: null, err: null };
const DAY_MS = 864e5;
const MAX_EVENTS = 25;
const MAX_COINS = 15;
const BUY_ADA = 1000;

const etTime = (ms) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
const pctTxt = (p, d) => (p == null ? "–" : p > 0 && p < 0.1 ? "<0.1%" : fmt(p, d != null ? d : p >= 10 ? 0 : 1) + "%");
const adaTxt = (v) => (v == null ? "–" : v >= 1000 ? compact(Math.round(v)) + " ADA" : v >= 1 ? fmt(v, v < 10 ? 1 : 0) + " ADA" : "<1 ADA");
const usd = (v) => {
  const r = st.data && st.data.adaUsd;
  return v != null && v >= 1 && r ? `<small>~${fmt(v * r, v * r < 10 ? 2 : 0)} USDCx</small>` : "";
};
const short = (a) => (a ? a.slice(0, 10) + "…" + a.slice(-6) : "–");
const tick = (c) => "$" + (c.tk || "?");
const ROLE = { solada: "Solada", creator: "Creator", burned: "Burned", other: "Other wallets", order: "Pending withdrawal" };

// Price move from one buy of `ada` into a constant-product pool with fee `feeBps` (out of 10,000).
export function buyImpact(c, ada = BUY_ADA) {
  const a = Number(c.reserves && c.reserves.a) / 1e6, b = Number(c.reserves && c.reserves.b);
  if (!(a > 0) || !(b > 0)) return null;
  const inAfterFee = ada * (1 - (c.fee || 0) / 1e4);
  const a2 = a + inAfterFee, b2 = (a * b) / a2;
  return ((a2 / b2) / (a / b) - 1) * 100;
}

function coinCell(c) {
  const img = c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'coin-dot'}))">` : `<span class="coin-dot"></span>`;
  const name = c.name && c.name.replace(/^\$/, "").toLowerCase() !== String(c.tk || "").toLowerCase() ? c.name : "";
  const auto = c.auto ? ` <span class="burn-auto-tag liq-auto-tag" title="Launcher turned on Solada's liquidity growth option">LP growth</span>` : "";
  return `<span class="coin-cell">${img}<span><a href="${esc(coinUrl(c.id))}" target="_blank" rel="noopener">${esc(tick(c))}</a>${auto}${name ? `<br><small class="cell-sub">${esc(name)}</small>` : ""}</span></span>`;
}

function shareBar(c) {
  const parts = ["solada", "creator", "other", "burned", "order"].filter((k) => (c.share[k] || 0) > 0);
  const bar = parts.map((k) => `<span class="liq-seg is-${k}" style="width:${Math.max(c.share[k], 1.5)}%" title="${esc(ROLE[k])} ${pctTxt(c.share[k], 1)}"></span>`).join("");
  const words = parts.sort((x, y) => c.share[y] - c.share[x]).slice(0, 2).map((k) => `<span class="liq-key is-${k}">${esc(ROLE[k])} ${pctTxt(c.share[k])}</span>`).join(" ");
  return `<div class="liq-share"><div class="liq-bar" role="img" aria-label="${esc(parts.map((k) => ROLE[k] + " " + pctTxt(c.share[k], 1)).join(", "))}">${bar}</div><small>${words}${c.nHolders > 1 ? `<span class="liq-n"> · ${fmt(c.nHolders)} holders</span>` : ""}</small></div>`;
}

function holdersDetail(c) {
  return `<div class="liq-holders">${c.holders.map((h) => `<div class="liq-holder"><span class="burn-who is-${esc(h.role)}">${esc(ROLE[h.role] || "Wallet")}</span><a class="unl-addr" href="https://cardanoscan.io/address/${esc(h.addr)}" target="_blank" rel="noopener" title="${esc(h.addr)}">${esc(h.name || short(h.addr))}</a><span class="liq-holder-num"><strong>${pctTxt(h.pct, 1)}</strong><small>≈ ${adaTxt(h.ada)} of the ADA side</small></span></div>`).join("")}${c.nHolders > c.holders.length ? `<p class="cell-sub">+ ${fmt(c.nHolders - c.holders.length)} smaller holders</p>` : ""}<p class="cell-sub">Pool: ${adaTxt(c.ada)} and ${compact(c.tok)} ${esc(tick(c))}${c.fee ? ` · ${fmt(c.fee / 100, 1)}% trading fee` : ""}${c.gAt ? ` · opened ${esc(etTime(c.gAt))}` : ""}${c.ch7 != null ? ` · ${c.ch7 > 0 ? "+" : ""}${fmt(c.ch7, 1)}% ADA over 7 days` : ""}</p></div>`;
}

const KIND = { add: "Added", remove: "Removed", move: "Moved", burn: "Burned", open: "Pool opened" };
function whoTag(role, name) {
  if (!role) return `<span class="burn-who">Wallet</span>`;
  return `<span class="burn-who is-${esc(role)}" title="${esc(name || "")}">${esc(role === "other" ? "Wallet" : ROLE[role])}</span>${role === "solada" && name ? `<small>${esc(name)}</small>` : ""}`;
}
function eventRow(e, coin) {
  const addr = e.kind === "move" && !e.addr ? e.to : e.addr;
  const to = e.kind === "move" || e.kind === "burn" ? `<small>to ${e.toRole === "burned" ? "the Graveyard" : esc(e.toName || short(e.to))}</small>` : "";
  return `<div class="unl-row burn-row liq-row is-${esc(e.kind)}">
    <div class="unl-coin">${coinCell({ ...(coin || {}), id: e.id, tk: e.tk, img: e.img })}</div>
    <div class="unl-size"><span class="liq-kind is-${esc(e.kind)}">${esc(KIND[e.kind] || e.kind)}</span>${to}</div>
    <div class="unl-ada"><strong>${adaTxt(e.ada)}</strong>${e.kind === "open" ? "<small>ADA side at opening</small>" : usd(e.ada) || "<small>ADA side</small>"}</div>
    <div class="unl-who">${whoTag(e.kind === "move" && !e.addr ? e.toRole : e.role, e.kind === "move" && !e.addr ? e.toName : e.name)}${addr ? `<a class="unl-addr" href="https://cardanoscan.io/address/${esc(addr)}" target="_blank" rel="noopener" title="${esc(addr)}">${short(addr)}</a>` : ""}</div>
    <div class="unl-when"><span>${esc(etTime(e.ms))}</span><small>${esc(timeAgo(e.ms))}</small></div>
    <div class="unl-ver-cell"><span class="burn-qty">${e.pct != null ? pctTxt(e.pct, 2) + " of the pool's LP" : ""}</span>${e.tx ? `<a class="unl-addr" href="https://cardanoscan.io/transaction/${esc(e.tx)}" target="_blank" rel="noopener">View transaction</a>` : addr ? `<a class="unl-addr" href="https://cardanoscan.io/address/${esc(addr)}" target="_blank" rel="noopener">View wallet</a>` : ""}</div>
  </div>`;
}

function matches(x) {
  if (!st.q) return true;
  const q = st.q.toLowerCase().replace(/^\$/, "");
  return (x.tk || "").toLowerCase().includes(q) || (x.name || "").toLowerCase().includes(q) || x.id === st.q;
}

function render() {
  const d = st.data;
  const notice = $("[data-notice]");
  if (!d) {
    if (st.err) { notice.hidden = false; notice.innerHTML = "<strong>Can't load the liquidity tracker right now.</strong> It will retry in a minute."; }
    return;
  }
  notice.hidden = true;
  const now = Date.now();
  const t = d.totals || { pools: 0, ada: 0, solada: 0, burned: 0, week: 0 };
  const byId = Object.fromEntries(d.coins.map((c) => [c.id, c]));

  const wkEv = d.events.filter((e) => e.ms >= now - 7 * DAY_MS);
  const wkSum = (k) => wkEv.filter((e) => e.kind === k).reduce((s, e) => s + (e.ada || 0), 0);
  $("[data-kpis]").innerHTML = `
    <div class="kpi"><span class="kpi-label">ADA in pools</span><span class="kpi-value">${adaTxt(t.ada)}</span><span class="kpi-sub">ADA side of ${fmt(t.pools)} Minswap pool${t.pools === 1 ? "" : "s"}</span></div>
    <div class="kpi"><span class="kpi-label">LP held by Solada</span><span class="kpi-value">${pctTxt(t.solada)}</span><span class="kpi-sub">by value · other wallets ${pctTxt((t.other || 0) + (t.creator || 0))}</span></div>
    <div class="kpi"><span class="kpi-label">LP burned</span><span class="kpi-value">${pctTxt(t.burned)}</span><span class="kpi-sub">${t.burned > 0 ? "sent to the Graveyard for good" : "no LP at the Graveyard yet"}</span></div>
    <div class="kpi"><span class="kpi-label">Changes in 7 days</span><span class="kpi-value">${fmt(wkEv.length)}</span><span class="kpi-sub">${wkEv.length ? `≈ ${adaTxt(wkSum("add"))} added · ${adaTxt(wkSum("remove"))} removed` : "no LP added or removed"}</span></div>`;

  // Liquidity growth setting.
  const autos = d.autoOn || [];
  $("[data-auto-panel]").hidden = !autos.length;
  $("[data-auto]").innerHTML = autos.map((a) => {
    const c = byId[a.id];
    const adds = d.events.filter((e) => e.id === a.id && e.kind === "add");
    const status = !c ? "Not graduated yet, so it has no pool." : adds.length ? `Last LP added ${esc(timeAgo(adds[0].ms))}, ≈ ${adaTxt(adds[0].ada)} ADA side.` : "No LP added since this tracker went live. The next add will show here.";
    return `<div class="burn-auto-row"><span class="coin-cell">${c && c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy">` : `<span class="coin-dot"></span>`}<span><a href="${esc(coinUrl(a.id))}" target="_blank" rel="noopener">$${esc(a.tk || "?")}</a></span></span><span class="burn-auto-status ${c ? "is-on" : ""}">${c ? "Pool open" : "Bonding"}</span><span class="burn-auto-text">${status}${c ? ` ${adaTxt(c.ada)} in its pool now.` : ""}</span></div>`;
  }).join("");

  // By coin.
  const list = d.coins.filter(matches);
  const rows = st.moreCoins || st.q ? list : list.slice(0, MAX_COINS);
  $("[data-coins-meta]").innerHTML = `ADA side of each pool, biggest first · tap a row for its LP holders · updated ${d.updatedAt ? esc(timeAgo(new Date(d.updatedAt).getTime())) : "–"}`;
  $("[data-coins]").innerHTML = rows.length
    ? rows.map((c) => {
      const imp = buyImpact(c);
      const ch = c.ch24 == null ? "–" : `<span class="${c.ch24 > 0 ? "pos" : c.ch24 < 0 ? "neg" : ""}">${c.ch24 > 0 ? "+" : ""}${fmt(c.ch24, 1)}%</span>`;
      return `<tr class="liq-coin-row" data-lp="${esc(c.lp)}" tabindex="0" aria-expanded="false">
        <td>${coinCell(c)}</td>
        <td class="num liq-ada-cell"><strong>${adaTxt(c.ada)}</strong>${usd(c.ada)}</td>
        <td class="num hide-sm">${pctTxt(c.depth)}<small class="cell-sub">of market cap</small></td>
        <td class="num hide-sm">${imp == null ? "–" : "+" + pctTxt(imp)}<small class="cell-sub">price move</small></td>
        <td class="num hide-sm">${ch}</td>
        <td>${shareBar(c)}</td>
      </tr><tr class="liq-detail" data-detail="${esc(c.lp)}" hidden><td colspan="6">${holdersDetail(c)}</td></tr>`;
    }).join("")
    : `<tr><td colspan="6"><p class="empty">${st.q ? "No pool found for that coin. Coins still on their bonding curve have no pool yet." : "No pools found yet."}</p></td></tr>`;
  const hiddenN = list.length - rows.length;
  const moreCoins = $("[data-more-coins]");
  moreCoins.hidden = hiddenN <= 0 || st.moreCoins || !!st.q;
  moreCoins.textContent = `Show all ${list.length} pools`;
  if (st.q && rows.length === 1) { const r = document.querySelector(".liq-coin-row"); if (r) toggleRow(r, true); }

  // Changes.
  const horizon = st.days ? now - st.days * DAY_MS : 0;
  const evs = d.events.filter((e) => e.ms >= horizon && matches({ ...e, name: byId[e.id] && byId[e.id].name }) && (!st.removesOnly || e.kind === "remove"));
  $("[data-ev-title]").textContent = st.days ? `Liquidity changes in the last ${st.days} days` : "Every liquidity change";
  const sum = (k) => evs.filter((e) => e.kind === k).reduce((s, e) => s + (e.ada || 0), 0);
  const since = d.since ? new Date(d.since).getTime() : null;
  $("[data-ev-meta]").innerHTML = evs.length
    ? `${fmt(evs.length)} change${evs.length === 1 ? "" : "s"} · ≈ ${adaTxt(sum("add"))} added, ≈ ${adaTxt(sum("remove"))} removed (ADA side) · newest first`
    : since ? `Watching since ${esc(etTime(since))}` : "";
  const shown = st.more ? evs : evs.slice(0, MAX_EVENTS);
  $("[data-events]").innerHTML = shown.length
    ? shown.map((e) => eventRow(e, byId[e.id])).join("")
    : `<p class="empty">${st.q || st.removesOnly ? "No changes match." : since && now - since < 2 * DAY_MS ? "No liquidity added, removed or moved since this tracker went live. Changes will show here as they happen." : "No liquidity changes in this window."}</p>`;
  const more = $("[data-more]");
  more.hidden = evs.length <= MAX_EVENTS || st.more;
  more.textContent = `Show ${evs.length - MAX_EVENTS} more change${evs.length - MAX_EVENTS === 1 ? "" : "s"}`;

  const dot = $("[data-live-dot]"), txt = $("[data-live-text]");
  const fresh = d.updatedAt && now - new Date(d.updatedAt).getTime() < 30 * 60000;
  dot.classList.toggle("is-live", !!fresh);
  dot.classList.toggle("is-stale", !fresh);
  txt.textContent = fresh ? "Watching the pools · checked every 10 minutes" : d.updatedAt ? "Paused · last update " + timeAgo(new Date(d.updatedAt).getTime()) : "Watching the pools";
}

function toggleRow(row, open) {
  const det = document.querySelector(`[data-detail="${row.dataset.lp}"]`);
  if (!det) return;
  const on = open != null ? open : det.hidden;
  det.hidden = !on;
  row.setAttribute("aria-expanded", String(on));
  row.classList.toggle("is-open", on);
}

async function load() {
  try {
    st.data = await getApi("/liquidity");
    st.err = null;
  } catch (e) {
    st.err = e;
  }
  const open = [...document.querySelectorAll(".liq-coin-row.is-open")].map((r) => r.dataset.lp);
  render();
  for (const lp of open) { const r = document.querySelector(`.liq-coin-row[data-lp="${lp}"]`); if (r) toggleRow(r, true); }
}

$("[data-periods]").addEventListener("click", (e) => {
  const b = e.target.closest("[data-p]");
  if (!b) return;
  st.days = Number(b.dataset.p);
  st.more = false;
  document.querySelectorAll("[data-periods] .tab").forEach((t) => t.classList.toggle("is-on", t === b));
  render();
});
$("[data-coins]").addEventListener("click", (e) => {
  if (e.target.closest("a")) return;
  const row = e.target.closest(".liq-coin-row");
  if (row) toggleRow(row);
});
$("[data-coins]").addEventListener("keydown", (e) => {
  const row = e.target.closest(".liq-coin-row");
  if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleRow(row); }
});
$("[data-search]").addEventListener("input", (e) => { st.q = e.target.value.trim(); st.more = false; render(); });
$("[data-removes-only]").addEventListener("change", (e) => { st.removesOnly = e.target.checked; st.more = false; render(); });
$("[data-more]").addEventListener("click", () => { st.more = true; render(); });
$("[data-more-coins]").addEventListener("click", () => { st.moreCoins = true; render(); });

const params = new URLSearchParams(location.search);
if (params.get("coin")) { st.q = params.get("coin"); $("[data-search]").value = st.q; }
load();
setInterval(load, 60000);

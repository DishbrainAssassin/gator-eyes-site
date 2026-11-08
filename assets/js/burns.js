// Burn tracker: every Solada token the worker has seen sent to the Cardano Graveyard.
import { getApi } from "./api.js?v=20261102-usdcx2";
import { coinUrl } from "./data.js?v=20261102-usdcx2";
import { esc, fmt, compact, timeAgo } from "./ui.js?v=20261102-usdcx2";
import { wireLinks } from "./common.js?v=20261102-usdcx2";

wireLinks();
const $ = (s) => document.querySelector(s);
const st = { days: 7, q: "", creatorOnly: false, more: false, moreCoins: false, data: null, err: null };
const DAY_MS = 864e5;
const MAX_EVENTS = 25;
const MAX_COINS = 15;
const DUST_PCT = 0.0001; // below this share of supply a coin is listed only under "Show all"

const etTime = (ms) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
const pctTxt = (p) => {
  if (p == null) return "–";
  if (p < 0.0001) return "<0.0001%";
  const d = p >= 10 ? 1 : p >= 0.1 ? 2 : p >= 0.01 ? 3 : 4;
  return p.toFixed(d) + "%";
};
const adaTxt = (v) => (v == null ? "–" : v >= 1000 ? compact(Math.round(v)) + " ADA" : v >= 1 ? fmt(v, v < 10 ? 1 : 0) + " ADA" : "<1 ADA");
const usd = (v) => {
  const r = st.data && st.data.adaUsd;
  return v != null && v >= 1 && r ? `<small>~${fmt(v * r, v * r < 10 ? 2 : 0)} USDCx</small>` : "";
};
const tokens = (qty, dec) => {
  const n = Number(qty) / 10 ** (dec || 0);
  return n >= 1000 ? compact(n) : fmt(n, n < 10 ? 2 : 0);
};
const short = (a) => (a ? a.slice(0, 10) + "…" + a.slice(-6) : "–");
const tick = (c) => "$" + (c.tk || "?");

function coinCell(c) {
  const img = c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'coin-dot'}))">` : `<span class="coin-dot"></span>`;
  const link = c.platform ? "https://www.solada.fun" : coinUrl(c.id);
  const name = c.platform ? "Solada platform token" : c.name && c.name.replace(/^\$/, "").toLowerCase() !== String(c.tk || "").toLowerCase() ? c.name : "";
  const auto = c.auto ? ` <span class="burn-auto-tag" title="Launcher picked Solada's Buy back &amp; burn route">Auto burn</span>` : "";
  return `<span class="coin-cell">${img}<span><a href="${esc(link)}" target="_blank" rel="noopener">${esc(tick(c))}</a>${auto}${name ? `<br><small class="cell-sub">${esc(name)}</small>` : ""}</span></span>`;
}

function whoCell(e) {
  if (e.who === "creator") return `<span class="burn-who is-creator">Creator</span>`;
  if (e.who === "solada") return `<span class="burn-who is-solada" title="${esc(e.whoName || "Solada wallet")}">Solada</span><small>${esc(e.whoName || "")}</small>`;
  return `<span class="burn-who">Wallet</span>`;
}

function eventRow(e, coin) {
  return `<div class="unl-row burn-row">
    <div class="unl-coin">${coinCell({ ...(coin || {}), id: e.id, tk: e.tk, img: e.img, name: coin ? coin.name : "" })}</div>
    <div class="unl-size"><strong>${pctTxt(e.pct)}</strong><small>of supply</small></div>
    <div class="unl-ada"><strong>${adaTxt(e.ada)}</strong>${usd(e.ada) || "<small>at today's price</small>"}</div>
    <div class="unl-who">${whoCell(e)}<a class="unl-addr" href="https://cardanoscan.io/address/${esc(e.from || "")}" target="_blank" rel="noopener" title="${esc(e.from || "")}">${short(e.from)}</a></div>
    <div class="unl-when"><span>${esc(etTime(e.ms))}</span><small>${esc(timeAgo(e.ms))}</small></div>
    <div class="unl-ver-cell"><span class="burn-qty">${tokens(e.qty, e.dec)} ${esc(tick(e))}</span><a class="unl-addr" href="https://cardanoscan.io/transaction/${esc(e.tx)}" target="_blank" rel="noopener">View transaction</a></div>
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
    if (st.err) { notice.hidden = false; notice.innerHTML = "<strong>Can't load the burn tracker right now.</strong> It will retry in a minute."; }
    return;
  }
  notice.hidden = true;
  const now = Date.now();
  const byId = Object.fromEntries(d.coins.map((c) => [c.id, c]));
  const grave = $("[data-grave]");
  if (grave && d.address) grave.href = "https://cardanoscan.io/address/" + d.address;

  // Summary strip (not filtered by search, so the headline numbers stay put).
  const real = d.coins.filter((c) => (c.pct || 0) >= DUST_PCT);
  const adaAll = real.reduce((s, c) => s + (c.ada || 0), 0);
  const wk = d.events.filter((e) => e.ms >= now - 7 * DAY_MS);
  const wkAda = wk.reduce((s, e) => s + (e.ada || 0), 0);
  const top = real.slice().sort((a, b) => (b.pct || 0) - (a.pct || 0))[0];
  const autos = d.autoOn || [];
  $("[data-kpis]").innerHTML = `
    <div class="kpi"><span class="kpi-label">Coins with burns</span><span class="kpi-value">${fmt(real.length)}</span><span class="kpi-sub">${fmt(d.total || 0)} burns seen since Oct 8</span></div>
    <div class="kpi"><span class="kpi-label">Burned value now</span><span class="kpi-value">≈ ${adaTxt(adaAll)}</span><span class="kpi-sub">${usd(adaAll) || "at today's prices"}</span></div>
    <div class="kpi"><span class="kpi-label">Burns in 7 days</span><span class="kpi-value">${fmt(d.week != null ? d.week : wk.length)}</span><span class="kpi-sub">≈ ${adaTxt(wkAda)} at today's prices</span></div>
    <div class="kpi"><span class="kpi-label">Most burned</span><span class="kpi-value">${top ? esc(tick(top)) : "–"}</span><span class="kpi-sub">${top ? pctTxt(top.pct) + " of supply gone" : "no burns yet"}</span></div>`;

  // Automatic route.
  $("[data-auto-panel]").hidden = !autos.length;
  $("[data-auto]").innerHTML = autos.map((a) => {
    const c = byId[a.id];
    const solada = d.events.filter((e) => e.id === a.id && e.who === "solada");
    const status = !a.grad ? "Not bonded yet, so no automatic burns until it graduates."
      : solada.length ? `Last automatic burn ${esc(timeAgo(solada[0].ms))} from ${esc(solada[0].whoName || "a Solada wallet")}.`
      : "No burn from a Solada wallet seen yet. The first one will show here with its sender.";
    return `<div class="burn-auto-row"><span class="coin-cell">${c && c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy">` : `<span class="coin-dot"></span>`}<span><a href="${esc(coinUrl(a.id))}" target="_blank" rel="noopener">$${esc(a.tk || "?")}</a></span></span><span class="burn-auto-status ${a.grad ? "is-on" : ""}">${a.grad ? "Bonded" : "Bonding"}</span><span class="burn-auto-text">${status}${c ? ` ${pctTxt(c.pct)} of supply burned so far.` : ""}</span></div>`;
  }).join("");

  // By coin.
  const list = d.coins.filter(matches);
  const visible = st.moreCoins || st.q ? list : list.filter((c) => (c.pct || 0) >= DUST_PCT);
  const rows = st.moreCoins || st.q ? visible : visible.slice(0, MAX_COINS);
  $("[data-coins-meta]").innerHTML = `Share of supply sitting at the Graveyard, biggest value first · updated ${d.updatedAt ? esc(timeAgo(new Date(d.updatedAt).getTime())) : "–"}`;
  $("[data-coins]").innerHTML = rows.length
    ? rows.map((c) => `<tr>
        <td>${coinCell(c)}</td>
        <td class="num"><strong>${pctTxt(c.pct)}</strong></td>
        <td class="num hide-sm">${tokens(c.qty, c.dec)}</td>
        <td class="num">${adaTxt(c.ada)}${usd(c.ada)}</td>
        <td class="num hide-sm">${c.n ? fmt(c.n) : "–"}</td>
        <td class="hide-sm">${c.last ? `${esc(timeAgo(c.last))}<small class="cell-sub">${esc(etTime(c.last))}</small>` : `<small class="cell-sub">before Oct 8</small>`}</td>
      </tr>`).join("")
    : `<tr><td colspan="6"><p class="empty">${st.q ? "No burns found for that coin." : "No burns found yet."}</p></td></tr>`;
  const hiddenN = list.length - rows.length;
  const moreCoins = $("[data-more-coins]");
  moreCoins.hidden = hiddenN <= 0 || st.moreCoins || !!st.q;
  moreCoins.textContent = `Show all ${list.length} coins`;

  // Burn events.
  const horizon = st.days ? now - st.days * DAY_MS : 0;
  const evs = d.events.filter((e) => e.ms >= horizon && matches({ ...e, name: byId[e.id] && byId[e.id].name }) && (!st.creatorOnly || e.who === "creator"));
  $("[data-ev-title]").textContent = st.days ? `Burns in the last ${st.days} days` : "Every burn";
  const evAda = evs.reduce((s, e) => s + (e.ada || 0), 0);
  $("[data-ev-meta]").innerHTML = evs.length
    ? `${fmt(evs.length)} burn${evs.length === 1 ? "" : "s"} on ${fmt(new Set(evs.map((e) => e.id)).size)} coin${new Set(evs.map((e) => e.id)).size === 1 ? "" : "s"} · ≈ ${adaTxt(evAda)} at today's prices · newest first`
    : "";
  const shown = st.more ? evs : evs.slice(0, MAX_EVENTS);
  $("[data-events]").innerHTML = shown.length
    ? shown.map((e) => eventRow(e, byId[e.id])).join("")
    : `<p class="empty">${st.q || st.creatorOnly ? "No burns match." : "No burns in this window."}</p>`;
  const more = $("[data-more]");
  more.hidden = evs.length <= MAX_EVENTS || st.more;
  more.textContent = `Show ${evs.length - MAX_EVENTS} more burn${evs.length - MAX_EVENTS === 1 ? "" : "s"}`;

  const dot = $("[data-live-dot]"), txt = $("[data-live-text]");
  const fresh = d.updatedAt && now - new Date(d.updatedAt).getTime() < 20 * 60000;
  dot.classList.toggle("is-live", !!fresh);
  dot.classList.toggle("is-stale", !fresh);
  txt.textContent = fresh ? "Watching the Graveyard · checked every 5 minutes" : d.updatedAt ? "Paused · last update " + timeAgo(new Date(d.updatedAt).getTime()) : "Watching the Graveyard";
}

async function load() {
  try {
    st.data = await getApi("/burns");
    st.err = null;
  } catch (e) {
    st.err = e;
  }
  render();
}

$("[data-periods]").addEventListener("click", (e) => {
  const b = e.target.closest("[data-p]");
  if (!b) return;
  st.days = Number(b.dataset.p);
  st.more = false;
  document.querySelectorAll("[data-periods] .tab").forEach((t) => t.classList.toggle("is-on", t === b));
  render();
});
$("[data-search]").addEventListener("input", (e) => { st.q = e.target.value.trim(); st.more = false; render(); });
$("[data-creator-only]").addEventListener("change", (e) => { st.creatorOnly = e.target.checked; st.more = false; render(); });
$("[data-more]").addEventListener("click", () => { st.more = true; render(); });
$("[data-more-coins]").addEventListener("click", () => { st.moreCoins = true; render(); });

const params = new URLSearchParams(location.search);
if (params.get("coin")) { st.q = params.get("coin"); $("[data-search]").value = st.q; }
load();
setInterval(load, 60000);

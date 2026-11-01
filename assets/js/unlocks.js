// Unlock calendar: every Solada token lock the worker has verified on-chain, by the day it opens.
import { getApi } from "./api.js?v=20261101-clean3";
import { coinUrl } from "./data.js?v=20261101-clean3";
import { esc, fmt, compact, timeAgo } from "./ui.js?v=20261101-clean3";
import { wireLinks } from "./common.js?v=20261101-clean3";

wireLinks();
const $ = (s) => document.querySelector(s);
const st = { days: 7, q: "", devOnly: false, more: false, moreCoins: false, data: null, err: null };
const DAY_MS = 864e5;
const MAX_DAYS = 10; // day groups shown before "Show more days"
const MAX_COINS = 15;

const VER = {
  script: ["is-script", "Verified on-chain", "The lock script was rebuilt from the owner's key and the unlock date and matches this address, and the tokens are still there."],
  meta: ["is-meta", "Dated by funding tx", "The transaction that funded this lock names the unlock slot, but the script could not be rebuilt."],
  none: ["is-sol", "Solada's date", "Only Solada's holders list dates this lock."],
};

// Locks open at midnight UTC. The day key is that UTC date; the row shows the Eastern time.
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayLabel = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
};
const etTime = (ms) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
const inDays = (ms, now) => {
  const h = (ms - now) / 36e5;
  if (h <= 1) return "within the hour";
  if (h < 36) return "in " + Math.round(h) + " hours";
  return "in " + Math.round(h / 24) + " days";
};
const adaOf = (coin, lock) => (lock.pct != null && coin.mc ? (lock.pct / 100) * coin.mc : null);
const pctTxt = (p) => (p == null ? "–" : p >= 10 ? p.toFixed(1) + "%" : p >= 1 ? p.toFixed(2) + "%" : p.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") + "%");
const adaTxt = (v) => (v == null ? "–" : v >= 1000 ? compact(Math.round(v)) + " ADA" : fmt(v, v < 10 ? 1 : 0) + " ADA");
const usd = (v) => {
  const r = st.data && st.data.adaUsd;
  return v != null && r ? `<small>~$${fmt(v * r, v * r < 10 ? 2 : 0)}</small>` : "";
};
const short = (a) => a.slice(0, 10) + "…" + a.slice(-6);

function coinCell(c) {
  const img = c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'coin-dot'}))">` : `<span class="coin-dot"></span>`;
  const name = c.name && c.name.replace(/^\$/, "").toLowerCase() !== String(c.tk || "").toLowerCase() ? c.name : "";
  return `<span class="coin-cell">${img}<span><a href="${esc(coinUrl(c.id))}" target="_blank" rel="noopener">$${esc(c.tk || "?")}</a>${name ? `<br><small class="cell-sub">${esc(name)}</small>` : ""}</span></span>`;
}

function verBadge(ver) {
  const [cls, label, tip] = VER[ver] || VER.none;
  return `<span class="unl-ver ${cls}" title="${esc(tip)}">${label}</span>`;
}

function lockRow(c, l, now) {
  const ada = adaOf(c, l);
  const diff = l.soladaMs ? `<span class="unl-note" title="Solada's holders list says ${esc(dayLabel(dayKey(l.soladaMs)))}; the chain says ${esc(dayLabel(dayKey(l.untilMs)))}.">Solada's date differs</span>` : "";
  return `<div class="unl-row">
    <div class="unl-coin">${coinCell(c)}</div>
    <div class="unl-size"><strong>${pctTxt(l.pct)}</strong><small>of supply</small></div>
    <div class="unl-ada"><strong>${adaTxt(ada)}</strong>${usd(ada)}</div>
    <div class="unl-who"><span class="unl-owner ${l.dev ? "is-dev" : ""}">${l.dev ? "Creator" : "Holder"}</span>${diff}</div>
    <div class="unl-when"><span>${l.open ? "opened " + esc(etTime(l.untilMs)) : esc(etTime(l.untilMs))}</span><small>${l.open ? "still at the lock address" : inDays(l.untilMs, now)}</small></div>
    <div class="unl-ver-cell">${verBadge(l.ver)}<a class="unl-addr" href="https://cardanoscan.io/address/${esc(l.addr)}" target="_blank" rel="noopener" title="${esc(l.addr)}">${short(l.addr)}</a></div>
  </div>`;
}

function matches(c) {
  if (!st.q) return true;
  const q = st.q.toLowerCase().replace(/^\$/, "");
  return (c.tk || "").toLowerCase().includes(q) || (c.name || "").toLowerCase().includes(q) || c.id === q;
}

function render() {
  const d = st.data;
  const notice = $("[data-notice]");
  if (!d) {
    if (st.err) { notice.hidden = false; notice.innerHTML = "<strong>Can't load the unlock calendar right now.</strong> It will retry in a minute."; }
    return;
  }
  notice.hidden = true;
  const now = Date.now();
  const coins = d.coins.filter(matches);
  const all = [];
  for (const c of coins) for (const l of c.locks) if (!st.devOnly || l.dev) all.push({ c, l });
  const upcoming = all.filter((x) => !x.l.open).sort((a, b) => a.l.untilMs - b.l.untilMs);
  const open = all.filter((x) => x.l.open).sort((a, b) => a.l.untilMs - b.l.untilMs);
  const horizon = st.days ? now + st.days * DAY_MS : Infinity;
  const inRange = upcoming.filter((x) => x.l.untilMs <= horizon);

  // Summary strip (unfiltered by search so the headline numbers stay stable).
  const every = [];
  for (const c of d.coins) for (const l of c.locks) every.push({ c, l });
  const up7 = every.filter((x) => !x.l.open && x.l.untilMs <= now + 7 * DAY_MS);
  const ada7 = up7.reduce((s, x) => s + (adaOf(x.c, x.l) || 0), 0);
  const nextUp = every.filter((x) => !x.l.open).sort((a, b) => a.l.untilMs - b.l.untilMs)[0];
  const openAll = every.filter((x) => x.l.open);
  const openAda = openAll.reduce((s, x) => s + (adaOf(x.c, x.l) || 0), 0);
  const cov = d.coverage || {};
  $("[data-kpis]").innerHTML = `
    <div class="kpi"><span class="kpi-label">Locks tracked</span><span class="kpi-value">${fmt(every.length)}</span><span class="kpi-sub">on ${fmt(d.coins.length)} coins · ${fmt(every.filter((x) => x.l.ver === "script").length)} verified on-chain</span></div>
    <div class="kpi"><span class="kpi-label">Opening in 7 days</span><span class="kpi-value">${fmt(up7.length)}</span><span class="kpi-sub">≈ ${adaTxt(ada7)} ${usd(ada7)} at today's prices</span></div>
    <div class="kpi"><span class="kpi-label">Next unlock</span><span class="kpi-value">${nextUp ? esc(dayLabel(dayKey(nextUp.l.untilMs))) : "–"}</span><span class="kpi-sub">${nextUp ? `$${esc(nextUp.c.tk)} · ${pctTxt(nextUp.l.pct)} of supply · ${esc(inDays(nextUp.l.untilMs, now))}` : "nothing scheduled"}</span></div>
    <div class="kpi"><span class="kpi-label">Open, not withdrawn</span><span class="kpi-value">${fmt(openAll.length)}</span><span class="kpi-sub">${openAll.length ? "≈ " + adaTxt(openAda) + " that can move any time" : "every opened lock has been withdrawn"}</span></div>`;

  // Calendar.
  $("[data-cal-title]").textContent = st.days ? `Opening in the next ${st.days} days` : "All upcoming unlocks";
  const adaIn = inRange.reduce((s, x) => s + (adaOf(x.c, x.l) || 0), 0);
  $("[data-cal-meta]").innerHTML = inRange.length
    ? `${fmt(inRange.length)} unlock${inRange.length === 1 ? "" : "s"} on ${fmt(new Set(inRange.map((x) => x.c.id)).size)} coin${new Set(inRange.map((x) => x.c.id)).size === 1 ? "" : "s"} · ≈ ${adaTxt(adaIn)} ${usd(adaIn)} · updated ${d.updatedAt ? timeAgo(new Date(d.updatedAt).getTime()) : "–"}`
    : `Nothing opens in this window${st.q ? " for that coin" : ""}.`;
  const groups = new Map();
  for (const x of inRange) { const k = dayKey(x.l.untilMs); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
  const keys = [...groups.keys()];
  const shown = st.more ? keys : keys.slice(0, MAX_DAYS);
  const todayKey = dayKey(now);
  $("[data-days]").innerHTML = shown.length
    ? shown.map((k) => {
        const xs = groups.get(k);
        const ada = xs.reduce((s, x) => s + (adaOf(x.c, x.l) || 0), 0);
        const big = ada >= 5000 || xs.some((x) => x.l.pct >= 5);
        return `<section class="unl-day ${big ? "is-big" : ""}">
          <header class="unl-day-head"><h3>${esc(dayLabel(k))}${k === todayKey ? " <span class=\"unl-today\">today</span>" : ""}<small>opens ${esc(etTime(Math.min(...xs.map((x) => x.l.untilMs))))}</small></h3><span>${xs.length} unlock${xs.length === 1 ? "" : "s"} · ≈ ${adaTxt(ada)} ${usd(ada)}${big ? " · <strong>big day</strong>" : ""}</span></header>
          ${xs.sort((a, b) => (adaOf(b.c, b.l) || 0) - (adaOf(a.c, a.l) || 0)).map((x) => lockRow(x.c, x.l, now)).join("")}
        </section>`;
      }).join("")
    : `<p class="empty">${upcoming.length ? `Nothing in this window. The next one is ${esc(dayLabel(dayKey(upcoming[0].l.untilMs)))} ($${esc(upcoming[0].c.tk)}).` : st.q || st.devOnly ? "No locks match." : "No upcoming locks found yet. The first scan of every coin takes about two hours."}</p>`;
  const more = $("[data-more]");
  more.hidden = keys.length <= MAX_DAYS || st.more;
  more.textContent = `Show ${keys.length - MAX_DAYS} more day${keys.length - MAX_DAYS === 1 ? "" : "s"}`;

  // Open, not withdrawn.
  $("[data-open-panel]").hidden = !open.length;
  $("[data-open]").innerHTML = open.map((x) => lockRow(x.c, x.l, now)).join("");

  // By coin.
  const byCoin = coins
    .map((c) => {
      const locks = c.locks.filter((l) => !st.devOnly || l.dev);
      const live = locks.filter((l) => !l.open);
      const pct = live.reduce((s, l) => s + (l.pct || 0), 0);
      return { c, locks, live, pct, ada: c.mc ? (pct / 100) * c.mc : null, next: live[0] || null };
    })
    .filter((r) => r.locks.length)
    .sort((a, b) => (a.next ? a.next.untilMs : 9e15) - (b.next ? b.next.untilMs : 9e15));
  const rows = st.moreCoins ? byCoin : byCoin.slice(0, MAX_COINS);
  $("[data-coins]").innerHTML = rows.length
    ? rows.map((r) => {
        const sol = r.c.solada && r.c.solada.pct != null ? r.c.solada.pct : null;
        const stale = sol != null && Math.abs(sol - r.pct) > 0.1;
        return `<tr>
          <td>${coinCell(r.c)}</td>
          <td class="num"><strong>${pctTxt(r.pct)}</strong></td>
          <td class="num hide-sm">${adaTxt(r.ada)}</td>
          <td class="num">${r.live.length}${(() => { const n = []; if (r.locks.length > r.live.length) n.push("+" + (r.locks.length - r.live.length) + " open"); if (r.live.some((l) => l.dev)) n.push("incl. creator"); return n.length ? ` <small class="cell-sub">${n.join(" · ")}</small>` : ""; })()}</td>
          <td>${r.next ? `${esc(dayLabel(dayKey(r.next.untilMs)))} <small class="cell-sub">${pctTxt(r.next.pct)} · ${esc(inDays(r.next.untilMs, now))}</small>` : "<small class=\"cell-sub\">none upcoming</small>"}</td>
          <td class="num hide-sm">${sol == null ? "–" : `<span class="${stale ? "unl-stale" : ""}" title="${stale ? "Solada's coin page still shows the launch-time figure." : "Matches the chain."}">${pctTxt(sol)}${stale ? " <small>stale</small>" : ""}</span>`}</td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="6"><p class="empty">No coins match.</p></td></tr>`;
  const moreCoins = $("[data-more-coins]");
  moreCoins.hidden = byCoin.length <= MAX_COINS || st.moreCoins;
  moreCoins.textContent = `Show all ${byCoin.length} coins`;

  // Live dot: the sweep touches the state every minute while the worker runs.
  const dot = $("[data-live-dot]"), txt = $("[data-live-text]");
  const fresh = d.updatedAt && now - new Date(d.updatedAt).getTime() < 15 * 60000;
  dot.classList.toggle("is-live", !!fresh);
  dot.classList.toggle("is-stale", !fresh);
  txt.textContent = fresh ? `Watching Solada · ${fmt(cov.coins || 0)} coins checked about every 2 hours` : d.updatedAt ? "Scan paused · last update " + timeAgo(new Date(d.updatedAt).getTime()) : "Watching Solada";
}

async function load() {
  try {
    st.data = await getApi("/unlocks");
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
$("[data-dev-only]").addEventListener("change", (e) => { st.devOnly = e.target.checked; render(); });
$("[data-more]").addEventListener("click", () => { st.more = true; render(); });
$("[data-more-coins]").addEventListener("click", () => { st.moreCoins = true; render(); });

const params = new URLSearchParams(location.search);
if (params.get("coin")) { st.q = params.get("coin"); $("[data-search]").value = st.q; }
load();
setInterval(load, 60000);

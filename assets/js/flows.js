// Flows dashboard. Reads the same feed as the home page through data.js.
import { subscribe, coinUrl } from "./data.js";
import { alertCard, emptyState, skeleton, dayLabel, fmt, usdcx, compact, clock, timeAgo, esc } from "./ui.js";
import { wireLinks, liveStatus } from "./common.js";

wireLinks();

const $ = (s) => document.querySelector(s);
const el = {
  days: $("[data-days]"),
  notice: $("[data-notice]"),
  kpis: $("[data-kpis]"),
  hours: $("[data-hours]"),
  venues: $("[data-venues]"),
  inflow: $("[data-inflow]"),
  outflow: $("[data-outflow]"),
  coins: $("[data-coins]"),
  coinsMore: $("[data-coins-more]"),
  search: $("[data-search]"),
  week: $("[data-week]"),
  alerts: $("[data-alerts]"),
  leadIn: $("[data-lead-in]"),
  leadOut: $("[data-lead-out]"),
  leadMeta: $("[data-lead-meta]"),
};

const VENUES = { curve: "Solada curve", minswap: "Minswap", splash: "Splash", pump: "Pump.fun", other: "Other" };
const STALE_MS = 15 * 60000;

let feed = null;
let day = "today";
let sortKey = "v";
let showAll = false;
let query = "";

el.kpis.innerHTML = '<div class="kpi skel-block"></div>'.repeat(6);
el.alerts.innerHTML = skeleton(3);

const shortSigned = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + (Math.abs(n) >= 1000 ? (Math.abs(n) / 1000).toFixed(1).replace(/\.0$/, "") + "k" : fmt(Math.abs(n)));
const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));
const coinImg = (k, size = 28) =>
  `<span class="coin-img coin-ph" aria-hidden="true">${esc((k.tk || "?").slice(0, 1))}${
    k.img ? `<img src="${esc(k.img)}" alt="" width="${size}" height="${size}" loading="lazy" onerror="this.remove()">` : ""
  }</span>`;
const coinLink = (k) => `<a class="coin" href="${esc(coinUrl(k.id))}" target="_blank" rel="noopener">${coinImg(k)}<span>$${esc(k.tk)}</span></a>`;

function dayOptions() {
  const opts = [];
  if (feed.today && feed.today.trades) opts.push({ id: "today", label: "Today", d: feed.today, live: true });
  for (const r of feed.recaps) opts.push({ id: r.key, label: dayLabel(r.key).slice(0, 3) + " " + r.key.slice(5).replace("-", "/"), d: r });
  return opts;
}

function renderNotice() {
  const age = feed && feed.updatedAt ? Date.now() - feed.updatedAt.getTime() : Infinity;
  const down = feed && (feed.lastFailAt || age > STALE_MS);
  if (!feed) {
    el.notice.hidden = false;
    el.notice.innerHTML = "The live feed isn't reachable right now. Alerts are still posting in Discord, and this page will fill in on its own once it reconnects.";
    return;
  }
  if (down) {
    const since = feed.updatedAt ? `${clock(feed.updatedAt.getTime())} (${timeAgo(feed.updatedAt.getTime())})` : "earlier";
    el.notice.hidden = false;
    el.notice.innerHTML = `<strong>Solada isn't answering right now</strong>, most likely while it updates. These are the last numbers from ${esc(since)}. The page refreshes on its own when Solada is back.`;
  } else el.notice.hidden = true;
}

function renderDays(opts) {
  if (!opts.find((o) => o.id === day)) day = opts[0].id;
  el.days.innerHTML = opts
    .map((o) => `<button role="tab" class="tab ${o.id === day ? "is-on" : ""}" aria-selected="${o.id === day}" data-day="${o.id}">${esc(o.label)}</button>`)
    .join("");
  el.days.querySelectorAll("[data-day]").forEach((b) =>
    b.addEventListener("click", () => {
      day = b.dataset.day;
      showAll = false;
      render();
    })
  );
}

function renderKpis(d, rate) {
  const net = d.buyAda - d.sellAda;
  const buyPct = d.volAda ? Math.round((d.buyAda / d.volAda) * 100) : 0;
  const k = (label, value, sub, cls = "") =>
    `<div class="kpi"><span class="kpi-label">${label}</span><span class="kpi-value ${cls}">${value}</span><span class="kpi-sub">${sub}</span></div>`;
  el.kpis.innerHTML = [
    k("Volume", compact(d.volAda) + " ADA", usdcx(d.volAda, rate)),
    k("Net flow", signed(net) + " ADA", `${buyPct}% of volume was buys`, net >= 0 ? "pos" : "neg"),
    k("Trades", fmt(d.trades), d.trades && d.volAda ? `avg ${fmt(d.volAda / d.trades)} ADA` : ""),
    k("Wallets", fmt(d.wallets), "traded at least once"),
    k("Biggest trade", d.big ? compact(d.big.ada) + " ADA" : "–", d.big ? `${esc(d.big.side)} <a href="${esc(coinUrl(d.big.id))}" target="_blank" rel="noopener">$${esc(d.big.tk)}</a>` : ""),
    k("Creator sells", fmt(d.dev ? d.dev.n : 0), d.dev ? fmt(d.dev.ada) + " ADA" : ""),
  ].join("");
}

const hourLabel = (h) => (h === 0 ? "12a" : h < 12 ? h + "a" : h === 12 ? "12p" : h - 12 + "p");

function renderHours(d, isToday) {
  if (!d.hours) {
    el.hours.innerHTML = emptyState("Hour-by-hour detail wasn't tracked yet on this day.");
    return;
  }
  const nowH = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date())) % 24;
  const max = Math.max(1, ...d.hours.map((h) => Math.max(h[0], h[1])));
  const cols = d.hours
    .map((h, i) => {
      const future = isToday && i > nowH;
      const net = h[0] - h[1];
      const tip = `${hourLabel(i)}–${hourLabel((i + 1) % 24)} ET: bought ${fmt(h[0])} ADA, sold ${fmt(h[1])} ADA, net ${signed(net)}, ${fmt(h[2])} trades`;
      const netPos = 50 - (net / max) * 50;
      return `<div class="hcol ${future ? "is-future" : ""} ${isToday && i === nowH ? "is-now" : ""}" title="${esc(tip)}" aria-label="${esc(tip)}" role="img">
        <span class="hb buy" style="height:${(h[0] / max) * 50}%"></span>
        <span class="hb sell" style="height:${(h[1] / max) * 50}%"></span>
        ${h[2] ? `<span class="hnet ${net >= 0 ? "pos" : "neg"}" style="top:${netPos}%"></span>` : ""}
        <span class="hlab">${i % 3 === 0 ? hourLabel(i) : ""}</span>
      </div>`;
    })
    .join("");
  el.hours.innerHTML = `<div class="hchart"><div class="hgrid"><span>${compact(max)}</span><span>0</span><span>${compact(max)}</span></div><div class="hcols">${cols}</div></div>`;
}

function renderVenues(d) {
  if (!d.venues) {
    el.venues.innerHTML = emptyState("Venue detail wasn't tracked yet on this day.");
    return;
  }
  const rows = Object.entries(d.venues)
    .map(([k, v]) => ({ k, b: v[0], s: v[1], n: v[2], t: v[0] + v[1] }))
    .filter((r) => r.t > 0)
    .sort((a, b) => b.t - a.t);
  const total = rows.reduce((a, r) => a + r.t, 0) || 1;
  el.venues.innerHTML = `<ul class="venues" role="list">${rows
    .map(
      (r) => `<li>
      <div class="venue-top"><span class="venue-name">${esc(VENUES[r.k] || r.k)}</span><span class="num">${compact(r.t)} ADA <span class="muted">${Math.round((r.t / total) * 100)}%</span></span></div>
      <div class="venue-bar" style="--share:${(r.t / total) * 100}%"><span class="vb buy" style="width:${(r.b / r.t) * 100}%"></span><span class="vb sell" style="width:${(r.s / r.t) * 100}%"></span></div>
      <div class="venue-sub"><span>${fmt(r.n)} trades</span><span class="${r.b - r.s >= 0 ? "pos" : "neg"}">net ${signed(r.b - r.s)}</span></div>
    </li>`
    )
    .join("")}</ul>`;
}

function coinsFor(d) {
  return d.coins && d.coins.length ? d.coins : d.top || [];
}

function renderFlowList(target, list, sign) {
  if (!list.length) {
    target.innerHTML = emptyState(sign > 0 ? "No coin was net bought." : "No coin was net sold.");
    return;
  }
  const max = Math.max(...list.map((k) => Math.abs(k.net)), 1);
  target.innerHTML = `<ol class="flowbars" role="list">${list
    .map(
      (k) => `<li>
      ${coinLink(k)}
      <span class="flowbar"><span class="${sign > 0 ? "buy" : "sell"}" style="width:${Math.max(3, (Math.abs(k.net) / max) * 100)}%"></span></span>
      <span class="num ${sign > 0 ? "pos" : "neg"}">${signed(k.net)}</span>
    </li>`
    )
    .join("")}</ol>`;
}

function renderFlows(d) {
  const all = coinsFor(d);
  const ins = (d.coins ? all.filter((k) => k.net > 0).sort((a, b) => b.net - a.net) : d.inflow || []).slice(0, 8);
  const outs = (d.coins ? all.filter((k) => k.net < 0).sort((a, b) => a.net - b.net) : d.outflow || []).slice(0, 8);
  renderFlowList(el.inflow, ins, 1);
  renderFlowList(el.outflow, outs, -1);
}

function renderCoins(d, rate) {
  const all = coinsFor(d);
  const q = query.trim().toLowerCase().replace(/^\$/, "");
  let list = all.filter((k) => !q || k.tk.toLowerCase().includes(q) || k.id.toLowerCase().includes(q));
  const sorters = { v: (a, b) => b.v - a.v, net: (a, b) => b.net - a.net, n: (a, b) => b.n - a.n };
  list = [...list].sort(sorters[sortKey]);
  const limit = showAll || q ? list.length : 15;
  if (!list.length) {
    el.coins.innerHTML = `<tr><td colspan="5">${emptyState(q ? "No coin matches that." : "No trades counted for this day yet.")}</td></tr>`;
    el.coinsMore.hidden = true;
    return;
  }
  el.coins.innerHTML = list
    .slice(0, limit)
    .map((k) => {
      const hasB = k.b != null;
      const s = hasB ? k.v - k.b : null;
      const bp = hasB && k.v ? (k.b / k.v) * 100 : 0;
      return `<tr>
        <td>${coinLink(k)}</td>
        <td class="num">${fmt(k.v)}<span class="cell-sub">${usdcx(k.v, rate)}</span></td>
        <td class="num ${k.net >= 0 ? "pos" : "neg"}">${signed(k.net)}</td>
        <td class="split-col">${
          hasB
            ? `<div class="rowsplit" title="Bought ${fmt(k.b)} ADA, sold ${fmt(s)} ADA"><span class="buy" style="width:${bp}%"></span><span class="sell" style="width:${100 - bp}%"></span></div><span class="cell-sub">${fmt(k.b)} / ${fmt(s)}</span>`
            : `<span class="muted">–</span>`
        }</td>
        <td class="num hide-sm">${fmt(k.n)}</td>
      </tr>`;
    })
    .join("");
  el.coinsMore.hidden = list.length <= limit;
  el.coinsMore.textContent = `Show all ${list.length} coins`;
}

function renderWeek(opts) {
  const days = opts.slice(0, 7).reverse();
  if (days.length < 2) {
    el.week.innerHTML = emptyState("The 7-day view fills in as daily recaps come in, one per day at 9 AM Eastern.");
    return;
  }
  const max = Math.max(1, ...days.map((o) => o.d.volAda));
  el.week.innerHTML = `<div class="wchart">${days
    .map((o) => {
      const d = o.d;
      const net = d.buyAda - d.sellAda;
      const tip = `${dayLabel(d.key)}: ${fmt(d.volAda)} ADA, bought ${fmt(d.buyAda)}, sold ${fmt(d.sellAda)}, net ${signed(net)}`;
      return `<button class="wcol ${o.id === day ? "is-on" : ""}" data-week-day="${o.id}" title="${esc(tip)}" aria-label="${esc(tip)}">
        <span class="wval num">${compact(d.volAda)}</span>
        <span class="wbar" style="height:${(d.volAda / max) * 100}%"><span class="buy" style="height:${d.volAda ? (d.buyAda / d.volAda) * 100 : 0}%"></span></span>
        <span class="wnet num ${net >= 0 ? "pos" : "neg"}">${shortSigned(net)}</span>
        <span class="wlab">${o.live ? "Today" : esc(dayLabel(d.key).slice(0, 3))}</span>
      </button>`;
    })
    .join("")}</div>`;
  el.week.querySelectorAll("[data-week-day]").forEach((b) =>
    b.addEventListener("click", () => {
      day = b.dataset.weekDay;
      showAll = false;
      render();
    })
  );
}

function renderLeaders(opts) {
  const days = opts.slice(0, 7).filter((o) => o.d.coins && o.d.coins.length);
  if (!days.length) {
    el.leadIn.innerHTML = el.leadOut.innerHTML = emptyState("Fills in as days are tracked with the updated bot.");
    return;
  }
  const sum = {};
  for (const o of days)
    for (const k of o.d.coins) {
      const s = (sum[k.id] ||= { id: k.id, tk: k.tk, img: k.img, net: 0, v: 0 });
      s.net += k.net;
      s.v += k.v;
      if (!s.img && k.img) s.img = k.img;
    }
  const all = Object.values(sum);
  renderFlowList(el.leadIn, all.filter((k) => k.net > 0).sort((a, b) => b.net - a.net).slice(0, 8), 1);
  renderFlowList(el.leadOut, all.filter((k) => k.net < 0).sort((a, b) => a.net - b.net).slice(0, 8), -1);
  el.leadMeta.textContent = `Net ADA bought minus sold, across ${days.length} day${days.length === 1 ? "" : "s"}${days.some((o) => o.live) ? " including today" : ""}`;
}

function renderAlerts() {
  const list = feed.alerts.slice(0, 6);
  el.alerts.innerHTML = list.length ? list.map(alertCard).join("") : emptyState("Quiet water. No alerts in the last few hours.");
}

const body = document.querySelector(".dash-body");
function render() {
  renderNotice();
  body.hidden = !feed;
  if (!feed) return;
  const opts = dayOptions();
  renderAlerts();
  if (!opts.length) {
    el.days.innerHTML = "";
    el.kpis.innerHTML = "";
    for (const t of [el.hours, el.venues, el.inflow, el.outflow, el.week]) t.innerHTML = emptyState("Counting starts with the first trade of the day.");
    el.coins.innerHTML = "";
    return;
  }
  renderDays(opts);
  const cur = opts.find((o) => o.id === day);
  renderKpis(cur.d, feed.rate);
  renderHours(cur.d, !!cur.live);
  renderVenues(cur.d);
  renderFlows(cur.d);
  renderCoins(cur.d, feed.rate);
  renderWeek(opts);
  renderLeaders(opts);
}

document.querySelectorAll("[data-sort]").forEach((b) =>
  b.addEventListener("click", () => {
    sortKey = b.dataset.sort;
    document.querySelectorAll("[data-sort]").forEach((x) => x.classList.toggle("is-on", x === b));
    render();
  })
);
el.coinsMore.addEventListener("click", () => {
  showAll = true;
  render();
});
el.search.addEventListener("input", () => {
  query = el.search.value;
  render();
});

subscribe((f, err) => {
  liveStatus(f, err);
  if (f) feed = f;
  render();
});

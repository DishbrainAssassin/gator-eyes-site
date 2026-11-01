import { subscribe } from "./data.js?v=20261101-clean1";
import { alertCard, emptyState, skeleton, tracks, mergeDays, lpSplit, dayLabel, fmt, usdcx, timeAgo, compact } from "./ui.js?v=20261101-clean1";
import { wireLinks, liveStatus } from "./common.js?v=20261101-clean1";
import * as platform from "./platform.js?v=20261101-clean1";

const SHOW_ALL = ' <button type="button" class="link" data-platform="all">Show all launchpads</button>';

wireLinks();
platform.mount();
import("./since.js?v=20261101-clean1").then((m) => m.mountSince()).catch(() => {});
platform.on(() => {
  shown = 10;
  renderAlerts();
  renderTracks();
});

const $ = (s) => document.querySelector(s);
const listEl = $("[data-alerts]");
const moreBtn = $("[data-more]");
const updatedEl = $("[data-updated]");
const daysEl = $("[data-days]");
const tracksEl = $("[data-tracks]");
const miniEl = $("[data-gaey-mini]");
const gaeyImg = $("[data-gaey-img]");

let feed = null;
let filter = "all";
let shown = 6;
let day = "today";

listEl.innerHTML = skeleton(4);
tracksEl.innerHTML = `<div class="kpis">${'<div class="kpi skel-block"></div>'.repeat(4)}</div>`;

document.querySelectorAll("[data-filter]").forEach((b) =>
  b.addEventListener("click", () => {
    filter = b.dataset.filter;
    shown = 10;
    document.querySelectorAll("[data-filter]").forEach((x) => {
      const on = x === b;
      x.classList.toggle("is-on", on);
      x.setAttribute("aria-pressed", String(on));
    });
    renderAlerts();
  })
);
moreBtn.addEventListener("click", () => {
  shown += 10;
  renderAlerts();
});

function renderAlerts() {
  if (!feed) return;
  const scoped = feed.alerts.filter(platform.inScope);
  const list = scoped.filter((a) => filter === "all" || a.kind === filter);
  if (!list.length) {
    const lp = platform.get();
    const other = lp !== "all" && feed.alerts.length > scoped.length ? SHOW_ALL : "";
    listEl.innerHTML = emptyState(
      lp !== "all"
        ? `No ${platform.label(lp)} alerts in the last few hours.`
        : filter === "all" ? "Quiet water. No alerts in the last few hours." : "Nothing in this category yet. The gator is still watching.",
      other
    );
  } else {
    listEl.innerHTML = list.slice(0, shown).map(alertCard).join("");
  }
  moreBtn.hidden = list.length <= shown;
}

function renderTracks() {
  if (!feed) return;
  const opts = dayOptions(feed, platform.get());
  if (!opts.length) {
    daysEl.innerHTML = "";
    const lp = platform.get();
    tracksEl.innerHTML = emptyState(
      lp !== "all" ? `No ${platform.label(lp)} trades counted yet today.` : "Gator Tracks starts counting with the first trade of the day.",
      lp !== "all" ? SHOW_ALL : ""
    );
    return;
  }
  if (!opts.find((o) => o.id === day)) day = opts[0].id;
  daysEl.innerHTML = opts
    .map((o) => `<button role="tab" class="tab ${o.id === day ? "is-on" : ""}" aria-selected="${o.id === day}" data-day="${o.id}">${o.label}</button>`)
    .join("");
  daysEl.querySelectorAll("[data-day]").forEach((b) =>
    b.addEventListener("click", () => {
      day = b.dataset.day;
      renderTracks();
    })
  );
  const cur = opts.find((o) => o.id === day);
  tracksEl.innerHTML = tracks(cur.d, feed.rate) + lpSplit(cur.parts, feed.rate, platform.get());
}

const dayName = (key) => dayLabel(key).replace(/,.*/, "") + " " + key.slice(5).replace("-", "/");

/** Day tabs for the chosen launchpad scope. "All" folds Solada and Snek.fun into one tally per day. */
export function dayOptions(feed, scope) {
  const sol = { today: feed.today, recaps: feed.recaps || [] };
  const snek = feed.snek || { today: null, recaps: [] };
  const opts = [];
  if (scope === "solada" || scope === "snek") {
    const src = scope === "snek" ? snek : sol;
    if (src.today && src.today.trades) opts.push({ id: "today", label: "Today so far", d: src.today });
    for (const r of src.recaps) if (r.trades) opts.push({ id: r.key, label: dayName(r.key), d: r });
    return opts;
  }
  const today = mergeDays(sol.today, snek.today);
  if (today) opts.push({ id: "today", label: "Today so far", d: today, parts: { solada: sol.today, snek: snek.today } });
  const keys = [...new Set([...sol.recaps.map((r) => r.key), ...snek.recaps.map((r) => r.key)])].sort().reverse();
  for (const key of keys) {
    const a = sol.recaps.find((r) => r.key === key);
    const b = snek.recaps.find((r) => r.key === key);
    const d = mergeDays(a, b);
    if (d) opts.push({ id: key, label: dayName(key), d, parts: { solada: a, snek: b } });
  }
  return opts;
}

function renderGaey() {
  const w = feed && feed.watch;
  if (!w || !w.quote) {
    miniEl.innerHTML = "";
    return;
  }
  const q = w.quote;
  if (w.image) gaeyImg.src = w.image;
  const mcAda = feed.rate && q.marketCapUsd ? q.marketCapUsd / feed.rate : null;
  miniEl.innerHTML = `
    <div><dt>Market cap</dt><dd>${compact(mcAda)} ADA</dd><dd class="muted">${usdcx(mcAda, feed.rate)}</dd></div>
    <div><dt>Holders</dt><dd>${fmt(q.holders)}</dd></div>
    <div><dt>24h trades</dt><dd>${fmt(q.trades24h)}</dd></div>`;
}

subscribe((f, err) => {
  liveStatus(f, err);
  if (!f) {
    listEl.innerHTML = emptyState("The live feed isn't reachable right now. Alerts are still posting in Discord.");
    tracksEl.innerHTML = emptyState("Gator Tracks will show here once the live feed reconnects.");
    return;
  }
  feed = f;
  updatedEl.textContent = f.updatedAt ? "Updated " + timeAgo(f.updatedAt.getTime()) : "";
  renderAlerts();
  renderTracks();
  renderGaey();
});

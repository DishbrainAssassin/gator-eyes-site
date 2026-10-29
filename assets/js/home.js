import { subscribe } from "./data.js?v=20261029k";
import { alertCard, emptyState, skeleton, tracks, dayLabel, fmt, usdcx, timeAgo, compact } from "./ui.js?v=20261029k";
import { wireLinks, liveStatus } from "./common.js?v=20261029k";

wireLinks();

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
let shown = 10;
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
  const list = feed.alerts.filter((a) => filter === "all" || a.kind === filter);
  if (!list.length) {
    listEl.innerHTML = emptyState(
      filter === "all" ? "Quiet water. No alerts in the last few hours." : "Nothing in this category yet. The gator is still watching."
    );
  } else {
    listEl.innerHTML = list.slice(0, shown).map(alertCard).join("");
  }
  moreBtn.hidden = list.length <= shown;
}

function renderTracks() {
  if (!feed) return;
  const opts = [];
  if (feed.today && feed.today.trades) opts.push({ id: "today", label: "Today so far", d: feed.today });
  for (const r of feed.recaps) opts.push({ id: r.key, label: dayLabel(r.key).replace(/,.*/, "") + " " + r.key.slice(5).replace("-", "/"), d: r });
  if (!opts.length) {
    daysEl.innerHTML = "";
    tracksEl.innerHTML = emptyState("Gator Tracks starts counting with the first trade of the day.");
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
  tracksEl.innerHTML = tracks(cur.d, feed.rate);
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

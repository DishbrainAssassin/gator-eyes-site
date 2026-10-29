// Graduation race: open bonding curves ranked by progress, with pace and ETA.
import { getApi, hours, span, signed } from "./api.js?v=20261029f";
import { coinUrl } from "./data.js?v=20261029f";
import { esc, fmt, compact, timeAgo } from "./ui.js?v=20261029f";
import { wireLinks, liveStatus } from "./common.js?v=20261029f";

wireLinks();
const $ = (s) => document.querySelector(s);
const st = { sort: "close", all: false, more: false, data: null };

function img(c, size = 28) {
  return c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy" width="${size}" height="${size}">` : `<span class="coin-dot"></span>`;
}

function etaBlock(c) {
  const p = c.pace || {};
  if (p.etaH != null) return `<div class="race-eta"><strong>${esc(hours(p.etaH))} to go</strong><span>${signed(p.n6)} ADA in 6h · ${signed(p.n1)} in 1h</span></div>`;
  return `<div class="race-eta is-still"><strong>Not moving closer</strong><span>${signed(p.n6 || 0)} ADA net in 6h</span></div>`;
}

function render() {
  const d = st.data;
  if (!d) return;
  const open = d.coins.filter((c) => c.cs === "open" && c.nAda);
  const racing = open.filter((c) => st.all || (c.prog || 0) >= 300);
  const sorters = {
    close: (a, b) => (b.prog || 0) - (a.prog || 0),
    fast: (a, b) => (a.pace?.etaH ?? 1e9) - (b.pace?.etaH ?? 1e9) || (b.prog || 0) - (a.prog || 0),
    new: (a, b) => (b.born || 0) - (a.born || 0),
  };
  racing.sort(sorters[st.sort]);
  const shown = st.more ? racing : racing.slice(0, 25);
  $("[data-race]").innerHTML = shown.length ? shown.map((c, i) => {
    const p = Math.min(100, (c.prog || 0) / 100);
    const need = c.pace ? c.pace.need : Math.max(0, c.nAda - (c.cAda || 0));
    return `<li class="race-row">
      <span class="race-rank">${i + 1}</span>
      <div class="coin-cell">${img(c)}<div><a href="${esc(coinUrl(c.id))}" target="_blank" rel="noopener">${esc(c.tk || "?")}</a><span class="cell-sub">${esc((c.name || "").slice(0, 24))}${c.born ? " · " + esc(span(Date.now() - c.born)) + " old" : ""}</span></div></div>
      <div class="race-bar"><span class="prog"><i style="--p:${p}%"></i></span><div class="race-nums"><span>${p.toFixed(1)}%</span><span>${fmt(need)} ADA to go</span></div></div>
      ${etaBlock(c)}
      <div class="race-act"><a class="icon-btn" href="./coincard.html?coin=${encodeURIComponent(c.id)}">Card</a></div>
    </li>`;
  }).join("") : `<li><div class="empty"><p>No coins on the curve right now.</p></div></li>`;
  $("[data-more]").hidden = st.more || racing.length <= 25;
  $("[data-more]").textContent = `Show all ${racing.length}`;

  const grads = d.coins.filter((c) => c.cs === "graduated" && c.gAt && Date.now() - c.gAt < 7 * 864e5).sort((a, b) => b.gAt - a.gAt);
  $("[data-grads]").innerHTML = grads.length ? grads.map((c) => `<li>
      <div class="coin-cell">${img(c, 24)}<div><a href="${esc(coinUrl(c.id))}" target="_blank" rel="noopener">${esc(c.tk || "?")}</a><span class="cell-sub">graduated ${esc(timeAgo(c.gAt))}</span></div></div>
      <span class="muted">${c.born && c.gAt > c.born ? "Took " + esc(span(c.gAt - c.born)) + " from launch" : ""}${c.w.h24 ? " · " + fmt(c.w.h24.v) + " ADA traded in 24h" : ""}</span>
    </li>`).join("") : `<li class="empty"><p>No coins graduated in the last 7 days.</p></li>`;

  const moving = open.filter((c) => c.pace && c.pace.etaH != null);
  const close = open.filter((c) => (c.prog || 0) >= 5000).length;
  const fastest = moving.sort((a, b) => a.pace.etaH - b.pace.etaH)[0];
  $("[data-kpis]").innerHTML = [
    ["On the curve", fmt(open.length), "coins still bonding"],
    ["Halfway or more", fmt(close), "50%+ to graduation"],
    ["Moving closer", fmt(moving.length), "net buying in the last 6h"],
    ["Graduated this week", fmt(grads.length), grads[0] ? "latest: " + (grads[0].tk || "") : ""],
    ["Fastest pace", fastest ? fastest.tk : "–", fastest ? hours(fastest.pace.etaH) + " to go" : "no net buying"],
    ["Typical target", open[0] ? fmt(open[0].nAda) + " ADA" : "–", "in the curve to graduate"],
  ].map(([l, v, s]) => `<div class="kpi"><span class="kpi-label">${esc(l)}</span><span class="kpi-value">${esc(v)}</span><span class="kpi-sub">${esc(s)}</span></div>`).join("");
  $("[data-updated]").textContent = d.updatedAt ? "Updated " + timeAgo(Date.parse(d.updatedAt)) + "." : "";
}

document.querySelectorAll("[data-s]").forEach((b) => b.addEventListener("click", () => {
  st.sort = b.dataset.s;
  document.querySelectorAll("[data-s]").forEach((x) => x.classList.toggle("is-on", x === b));
  render();
}));
$("[data-all]").addEventListener("change", (e) => { st.all = e.target.checked; render(); });
$("[data-more]").addEventListener("click", () => { st.more = true; render(); });
$("[data-race]").innerHTML = Array.from({ length: 6 }, () => `<li class="skel-block" style="min-height:64px"></li>`).join("");

async function load() {
  try {
    st.data = await getApi("/tokens");
    $("[data-notice]").hidden = true;
    liveStatus({ updatedAt: new Date(st.data.updatedAt) });
    render();
  } catch (e) {
    liveStatus(null, e);
    if (!st.data) { const n = $("[data-notice]"); n.hidden = false; n.innerHTML = "<strong>Can't reach the Gator Eyes feed right now.</strong> It will retry in a minute."; $("[data-race]").innerHTML = ""; }
  }
}
load();
setInterval(load, 60000);

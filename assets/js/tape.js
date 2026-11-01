// Live trade tape: a stock-ticker strip under the header on every page. Reads the last
// 40 trades from /feed (both launchpads), newest first, and scrolls them sideways.
// Pauses on hover and focus. With reduced motion it becomes a plain side-scrolling row.
import { subscribe } from "./data.js?v=20261101p";
import * as platform from "./platform.js?v=20261101p";
import { fmt, esc } from "./ui.js?v=20261101p";

const PX_PER_SEC = 55; // scroll speed
let host, track, lastKey = "", items = [];

function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return s + "s";
  const m = Math.round(s / 60);
  if (m < 60) return m + "m";
  return Math.round(m / 60) + "h";
}

function item(t) {
  const tk = t.tk || (t.id || "").replace(/^draft-/, "").replace(/^snek:/, "").slice(0, 10);
  const buy = t.side === "buy";
  const img = t.img ? `<img src="${esc(t.img)}" alt="" width="16" height="16" loading="lazy" onerror="this.remove()">` : "";
  const lp = t.src === "snek" ? `<i class="tape-lp lp-snek" title="Snek.fun"></i>` : "";
  const ada = t.ada >= 1000 ? fmt(t.ada) : fmt(t.ada, t.ada < 10 ? 2 : 0);
  return `<a class="tape-item ${buy ? "is-buy" : "is-sell"}" href="./tokens.html?q=${encodeURIComponent(tk)}" title="${buy ? "Bought" : "Sold"} ${fmt(t.ada, 2)} ADA of $${esc(tk)} ${esc(ago(t.at))} ago${t.src === "snek" ? " on Snek.fun" : ""}">${lp}${img}<b>$${esc(tk)}</b><span class="tape-side">${buy ? "▲" : "▼"} ${ada} ADA</span><small>${esc(ago(t.at))}</small></a>`;
}

function render() {
  if (!track) return;
  const rows = items.filter((t) => platform.inScope(t));
  if (!rows.length) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const html = rows.map(item).join("");
  const key = rows.map((t) => t.at + t.id + t.side).join("|") + "|" + platform.get();
  if (key === lastKey) {
    // Same trades: only refresh the ages so the strip doesn't jump.
    track.querySelectorAll(".tape-item").forEach((el, i) => {
      const t = rows[i % rows.length];
      const s = el.querySelector("small");
      if (s && t) s.textContent = ago(t.at);
    });
    return;
  }
  lastKey = key;
  track.innerHTML = `<div class="tape-set">${html}</div><div class="tape-set" aria-hidden="true">${html}</div>`;
  // Speed scales with content so short and long strips move at the same pace.
  requestAnimationFrame(() => {
    const w = track.firstElementChild ? track.firstElementChild.scrollWidth : 0;
    track.style.setProperty("--tape-dur", Math.max(20, Math.round(w / PX_PER_SEC)) + "s");
  });
}

export function mountTape() {
  const header = document.querySelector(".site-header");
  if (!header || document.querySelector(".tape")) return;
  host = document.createElement("div");
  host.className = "tape";
  host.hidden = true;
  host.setAttribute("role", "region");
  host.setAttribute("aria-label", "Live trade tape");
  host.innerHTML = `<div class="tape-label"><span class="live-dot is-live" aria-hidden="true"></span>Live</div><div class="tape-view"><div class="tape-track"></div></div>`;
  header.after(host);
  track = host.querySelector(".tape-track");
  subscribe((feed) => {
    if (!feed) return;
    items = Array.isArray(feed.tape) ? feed.tape : [];
    render();
  });
  platform.on(() => render());
  setInterval(() => render(), 30000);
}

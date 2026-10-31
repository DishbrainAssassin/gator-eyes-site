import { CONFIG } from "./config.js?v=20261101a";
import { joinUrl, coinUrl } from "./data.js?v=20261101a";
import { timeAgo } from "./ui.js?v=20261101a";

/** Fill every [data-link] with the right URL so links live in one place (config.js). */
export function wireLinks(root = document) {
  const map = {
    discord: CONFIG.discord,
    x: CONFIG.x,
    join: joinUrl(),
    "gaey-coin": coinUrl(CONFIG.watchToken),
  };
  root.querySelectorAll("[data-link]").forEach((a) => {
    const u = map[a.dataset.link];
    if (!u) return;
    a.href = u;
    a.target = "_blank";
    a.rel = "noopener";
  });
  navTips();
  import("./gator.js?v=20261101a").then((m) => m.mountGator()).catch(() => {});
  import("./extras.js?v=20261101a").then((m) => m.mountExtras()).catch(() => {});
}

export function liveStatus(feed, err) {
  const dot = document.querySelector("[data-live-dot]");
  const txt = document.querySelector("[data-live-text]");
  if (!dot || !txt) return;
  const fresh = feed && feed.updatedAt && Date.now() - feed.updatedAt.getTime() < 15 * 60000;
  dot.classList.toggle("is-live", !!fresh);
  dot.classList.toggle("is-stale", !fresh);
  const pads = feed && feed.sources && feed.sources.snek && feed.sources.snek.on ? "Solada and Snek.fun" : "Solada";
  if (err && !feed) txt.textContent = "Live feed reconnecting";
  else if (fresh) txt.textContent = `Watching ${pads} · checks every 2 min`;
  else if (feed && feed.updatedAt) txt.textContent = "Feed paused · last update " + timeAgo(feed.updatedAt.getTime());
  else txt.textContent = `Watching ${pads}`;
}

// Short hover descriptions for the top navigation.
const NAV_TIPS = {
  "./index.html#alerts": ["Alerts", "Whale trades, volume spikes, fast launches and creator sells on Solada.fun and Snek.fun, as they happen."],
  "./tokens.html": ["Tokens", "Every coin in one table: volume, net flow, price change and graduation progress."],
  "./race.html": ["Race", "Coins on the bonding curve, ranked by how close they are to graduating, with pace and a rough ETA."],
  "./flows.html": ["Flows", "Where the ADA went today: money in and out by coin, by hour and by venue."],
  "./followup.html": ["Follow-up", "What each alert's coin did 1 hour and 24 hours later. Every alert, good and bad."],
  "./watchlist.html": ["Watchlist", "Star coins and see their price, flows, graduation progress and alerts in one place. Saved in your browser, no sign-up."],
  "./tools.html": ["Tools", "Free tools for projects: holder snapshot with CSV, coin share cards, daily flow card and an alerts widget."],
  "./gaey.html": ["$GAEY", "The Gator Eyes team token: live trades, holder rewards and the creator lock."],
  "./about.html": ["How it works", "What sets off each alert, where the data comes from and what each Discord channel is for."],
};

function navTips() {
  if (document.querySelector(".nav-tip")) return;
  const tip = document.createElement("div");
  tip.className = "nav-tip";
  tip.id = "nav-tip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.appendChild(tip);
  let timer = 0;
  const show = (a) => {
    const t = NAV_TIPS[(a.getAttribute("href") || "").replace(/\?[^#]*/, "")];
    if (!t) return;
    clearTimeout(timer);
    tip.innerHTML = `<strong>${t[0]}</strong><span>${t[1]}</span>`;
    tip.hidden = false;
    const r = a.getBoundingClientRect();
    const w = tip.offsetWidth;
    const left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    tip.style.left = left + "px";
    tip.style.top = r.bottom + 10 + "px";
    tip.style.setProperty("--arrow", r.left + r.width / 2 - left + "px");
    a.setAttribute("aria-describedby", "nav-tip");
    requestAnimationFrame(() => tip.classList.add("is-on"));
  };
  const hide = () => { tip.classList.remove("is-on"); timer = setTimeout(() => (tip.hidden = true), 120); };
  // Hover only on devices with a real pointer; on phones a tap just opens the page.
  document.querySelectorAll(".nav a").forEach((a) => {
    a.addEventListener("pointerenter", (e) => e.pointerType !== "touch" && show(a));
    a.addEventListener("pointerleave", hide);
    a.addEventListener("click", hide);
    a.addEventListener("focus", () => a.matches(":focus-visible") && show(a));
    a.addEventListener("blur", hide);
  });
  document.querySelector(".nav")?.addEventListener("scroll", hide, { passive: true });
  addEventListener("keydown", (e) => e.key === "Escape" && hide());
}

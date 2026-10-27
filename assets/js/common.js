import { CONFIG } from "./config.js";
import { joinUrl, coinUrl } from "./data.js";
import { timeAgo } from "./ui.js";

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
}

export function liveStatus(feed, err) {
  const dot = document.querySelector("[data-live-dot]");
  const txt = document.querySelector("[data-live-text]");
  if (!dot || !txt) return;
  const fresh = feed && feed.updatedAt && Date.now() - feed.updatedAt.getTime() < 15 * 60000;
  dot.classList.toggle("is-live", !!fresh);
  dot.classList.toggle("is-stale", !fresh);
  if (err && !feed) txt.textContent = "Live feed reconnecting";
  else if (fresh) txt.textContent = "Watching Solada · checked " + timeAgo(feed.updatedAt.getTime());
  else if (feed && feed.updatedAt) txt.textContent = "Solada paused · last update " + timeAgo(feed.updatedAt.getTime());
  else txt.textContent = "Watching Solada";
}

// Token profile: what the creator filled in on Solada.fun or Snek.fun when they launched
// (a short description plus X, website, Telegram and Discord links). Gator Eyes shows it as-is
// and never vouches for it. Used by the Stat card page, Holders, Trades and the alert page.
import { getApi } from "./api.js?v=20261102-usdcx2";
import { esc } from "./ui.js?v=20261102-usdcx2";

export const LINK_NAMES = { twitter: "X", website: "Website", telegram: "Telegram", discord: "Discord" };
const ORDER = ["twitter", "website", "telegram", "discord"];
const memo = new Map();

const siteOf = (c) => (c && c.src === "snek" ? "Snek.fun" : "Solada.fun");
const safeUrl = (v) => { try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } };
/** Short readable form of a link: x.com/name → @name, everything else host + path. */
export function shortLink(k, v) {
  const u = String(v || "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
  const x = /^(?:x|twitter)\.com\/([A-Za-z0-9_]{1,30})(?:[/?#].*)?$/i.exec(u);
  if (k === "twitter" && x) return "@" + x[1];
  return u.length > 34 ? u.slice(0, 33) + "…" : u;
}

/** Profile for one coin. Falls back to the links already in /tokens when the profile lookup isn't available. */
export async function loadProfile(c) {
  if (!c) return null;
  const key = c.id;
  if (memo.has(key)) return memo.get(key);
  const p = getApi("/profile", { coin: c.id })
    .then((j) => ({ site: j.site || siteOf(c), about: j.about || "", links: j.links || {}, full: true }))
    .catch(() => ({ site: siteOf(c), about: "", links: c.links || {}, full: false }));
  memo.set(key, p);
  return p;
}

function linkChips(links) {
  return ORDER.filter((k) => links && safeUrl(links[k])).map((k) =>
    `<a class="profile-link" href="${esc(safeUrl(links[k]))}" target="_blank" rel="noopener nofollow ugc" title="${esc(links[k])}"><span class="profile-link-k">${LINK_NAMES[k]}</span><span class="profile-link-v">${esc(shortLink(k, links[k]))}</span></a>`).join("");
}
const aboutHtml = (s) => esc(s).replace(/\n/g, "<br>");

/**
 * HTML for the profile. compact=true is the one-strip version for Holders/Trades/alerts,
 * with a link to the full profile on the Stat card page.
 */
export function profileHtml(p, c, { compact = false } = {}) {
  if (!p) return "";
  const tk = c && c.tk ? "$" + c.tk : "this coin";
  const chips = linkChips(p.links);
  const has = !!(p.about || chips);
  const src = `From the creator on ${esc(p.site)} · not checked by Gator Eyes`;
  if (compact) {
    if (!has && !p.full) return "";
    if (!has) return `<div class="profile is-compact is-empty"><span class="cell-sub">No description or links from the creator on ${esc(p.site)}.</span></div>`;
    const short = p.about && p.about.length > 160 ? p.about.slice(0, 159).trimEnd() + "…" : p.about;
    return `<div class="profile is-compact">
      ${short ? `<p class="profile-about">${aboutHtml(short)}</p>` : ""}
      <div class="profile-links">${chips}<a class="profile-more" href="./coincard.html?coin=${encodeURIComponent(c.id)}#profile">Full profile</a></div>
      <p class="profile-src">${src}</p>
    </div>`;
  }
  const empty = p.full
    ? `The creator didn't add a description or links on ${esc(p.site)}. That's what they filled in when they launched, so nothing is hiding.`
    : `Couldn't read the creator's description right now. Try again in a minute.`;
  return `<section class="profile" id="profile" aria-labelledby="profile-h">
    <div class="profile-head"><h2 class="panel-title" id="profile-h">About ${esc(tk)}</h2><span class="profile-src">${src}</span></div>
    ${p.about ? `<p class="profile-about">${aboutHtml(p.about)}</p>` : !chips ? `<p class="cell-sub">${empty}</p>` : ""}
    ${chips ? `<div class="profile-links">${chips}</div>` : ""}
    ${has ? `<p class="profile-note">Creators fill this in when they launch. Check that a link really belongs to the project before trusting it, and never sign a wallet request from a link you weren't expecting.</p>` : ""}
  </section>`;
}

/** Put a compact profile strip right after `after` (an element), replacing any earlier one. */
export async function mountCompact(after, c) {
  if (!after || !c) return;
  const old = after.parentNode.querySelector(":scope > .profile[data-for]");
  if (old) old.remove();
  const p = await loadProfile(c);
  const box = document.createElement("div");
  box.innerHTML = profileHtml(p, c, { compact: true });
  const el = box.firstElementChild;
  if (!el) return;
  el.dataset.for = c.id;
  after.parentNode.querySelector(":scope > .profile[data-for]")?.remove();
  after.insertAdjacentElement("afterend", el);
}

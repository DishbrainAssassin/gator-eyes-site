// Bottom navigation bar for the installed phone app. A home-screen app has no browser
// toolbar, so there is no back button; this bar adds Back plus the main places to go.
// Shown only when Gator Eyes runs as an installed app (or was opened from its icon).
const KEY = "ge-app-mode";

function inApp() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  let flagged = false;
  try {
    if (new URLSearchParams(location.search).get("source") === "app") sessionStorage.setItem(KEY, "1");
    flagged = sessionStorage.getItem(KEY) === "1";
  } catch {}
  return standalone || flagged;
}

const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>',
  tokens: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  watch: '<path d="M12 4l2.5 5.1 5.5.8-4 3.9.9 5.5L12 16.7 7.1 19.3 8 13.8 4 9.9l5.5-.8z"/>',
  tools: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;

const LINKS = [
  { k: "home", label: "Home", href: "./index.html", match: ["", "index.html"] },
  { k: "tokens", label: "Tokens", href: "./tokens.html", match: ["tokens.html"] },
  { k: "watch", label: "Watchlist", href: "./watchlist.html", match: ["watchlist.html"] },
  { k: "tools", label: "Tools", href: "./tools.html", match: ["tools.html", "race.html", "flows.html", "unlocks.html", "followup.html", "holders.html", "coincard.html", "card.html", "about.html", "gaey.html", "app.html"] },
];

function page() {
  return location.pathname.split("/").pop() || "";
}

// Going back is only safe when there is a Gator Eyes page behind this one.
function canGoBack() {
  if (history.length > 1) return true;
  try { return !!document.referrer && new URL(document.referrer).origin === location.origin; } catch { return false; }
}

export function mountAppNav() {
  if (!inApp() || document.querySelector(".app-nav") || !document.querySelector(".site-header")) return;
  document.documentElement.classList.add("is-app");

  // Let the bar sit above the iPhone home indicator.
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp && !/viewport-fit/.test(vp.content)) vp.content += ", viewport-fit=cover";

  const here = page();
  const nav = document.createElement("nav");
  nav.className = "app-nav";
  nav.setAttribute("aria-label", "App");
  const back = canGoBack() || !LINKS[0].match.includes(here);
  nav.innerHTML =
    `<button type="button" class="app-nav-item" data-app-back${back ? "" : " disabled"}>${icon("back")}<span>Back</span></button>` +
    LINKS.map((l) => {
      const on = l.match.includes(here);
      return `<a class="app-nav-item${on ? " is-on" : ""}" href="${l.href}"${on ? ' aria-current="page"' : ""}>${icon(l.k)}<span>${l.label}</span></a>`;
    }).join("") +
    `<button type="button" class="app-nav-item app-nav-ask" data-ask aria-haspopup="dialog" aria-controls="gator-panel"><img src="./assets/img/gator-nerd-head-160.webp" alt="" width="24" height="24"><span>Ask</span></button>`;
  document.body.appendChild(nav);

  nav.querySelector("[data-app-back]").addEventListener("click", () => {
    if (canGoBack()) history.back();
    else location.href = "./index.html";
  });
}

// Site-wide launchpad filter. One value (all / solada / snek), remembered on this device
// and mirrored in ?lp= so a shared link opens the same view.
export const LP = {
  solada: { label: "Solada", cls: "lp-solada", site: "Solada.fun" },
  snek: { label: "Snek.fun", cls: "lp-snek", site: "Snek.fun" },
};
export const CHOICES = ["all", "solada", "snek"];
const KEY = "ge-platform";

const fromUrl = new URLSearchParams(location.search).get("lp");
let stored = null;
try { stored = localStorage.getItem(KEY); } catch {}
let cur = CHOICES.includes(fromUrl) ? fromUrl : CHOICES.includes(stored) ? stored : "all";
const subs = new Set();

export const srcOf = (x) => (x && x.src === "snek" ? "snek" : "solada");
export const label = (v) => (v === "all" ? "All launchpads" : LP[v] ? LP[v].label : v);
export const get = () => cur;
/** True when item x (an alert, coin or token row with .src) belongs to the current scope. */
export const inScope = (x) => cur === "all" || srcOf(x) === cur;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Small launchpad pill. Clicking it narrows the site to that launchpad. */
export function pill(key, { button = true } = {}) {
  const lp = LP[key] || LP.solada;
  const k = LP[key] ? key : "solada";
  return button
    ? `<button type="button" class="lp-pill ${lp.cls}" data-platform-pick="${k}" title="Show ${esc(lp.label)} only"><i></i>${esc(lp.label)}</button>`
    : `<span class="lp-pill ${lp.cls}"><i></i>${esc(lp.label)}</span>`;
}

function paint() {
  document.documentElement.dataset.platform = cur;
  document.querySelectorAll("[data-platform]").forEach((b) => {
    const on = b.dataset.platform === cur;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", String(on));
  });
  // Carry the choice into same-site page links so moving between pages keeps the view.
  document.querySelectorAll('a[href^="./"][href*=".html"]').forEach((a) => {
    const u = new URL(a.getAttribute("href"), location.href);
    if (cur === "all") u.searchParams.delete("lp");
    else u.searchParams.set("lp", cur);
    a.setAttribute("href", u.pathname.split("/").pop() + u.search + u.hash);
  });
  const hint = document.querySelector("[data-platform-hint]");
  if (hint) hint.textContent = cur === "all" ? "Showing every launchpad the gator watches." : `Showing ${label(cur)} only. Remembered on this device.`;
}

export function set(v) {
  if (!CHOICES.includes(v) || v === cur) return;
  cur = v;
  try { localStorage.setItem(KEY, v); } catch {}
  const u = new URL(location.href);
  if (v === "all") u.searchParams.delete("lp");
  else u.searchParams.set("lp", v);
  history.replaceState(null, "", u);
  paint();
  subs.forEach((f) => f(v));
}

/** Subscribe to changes. Returns an unsubscribe function. */
export function on(f) {
  subs.add(f);
  return () => subs.delete(f);
}

/** Render the platform bar into [data-platform-bar]. Safe to call when the host is missing. */
export function mount(host = document.querySelector("[data-platform-bar]")) {
  if (!host) return;
  host.innerHTML = `<div class="platform-bar">
    <div class="wrap platform-inner">
      <span class="platform-label">Launchpad</span>
      <div class="seg" role="group" aria-label="Filter the site by launchpad">
        <button type="button" data-platform="all" aria-pressed="false">All</button>
        <button type="button" class="lp-solada" data-platform="solada" aria-pressed="false"><i></i>Solada</button>
        <button type="button" class="lp-snek" data-platform="snek" aria-pressed="false"><i></i>Snek.fun</button>
      </div>
      <span class="platform-hint" data-platform-hint></span>
    </div>
  </div>`;
  paint();
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-platform], [data-platform-pick]");
  if (!b || b.disabled) return;
  e.preventDefault();
  set(b.dataset.platform || b.dataset.platformPick);
});
paint();

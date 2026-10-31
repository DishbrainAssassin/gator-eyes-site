// Browser-saved watchlist. The list lives in this browser only (localStorage), so
// there's no sign-up and no wallet. Coins are stored by their Gator Eyes id
// ("draft-xxx" for Solada, "snek:<policy>.<hex>" for Snek.fun) with a small
// snapshot (ticker, name, image, launchpad) so a coin can still be shown after
// it drops out of the live coin list.
const KEY = "ge-watchlist";
const MAX = 60;

let mem = null;          // in-memory copy when storage is blocked (private mode etc.)
let persistent = true;
const subs = new Set();

function read() {
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(KEY);
    const j = raw ? JSON.parse(raw) : null;
    mem = j && Array.isArray(j.items) ? j.items.filter((x) => x && typeof x.id === "string") : [];
  } catch {
    mem = mem || [];
    persistent = false;
  }
  return mem;
}

function write(items) {
  mem = items;
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, items }));
    persistent = true;
  } catch {
    persistent = false;
  }
  subs.forEach((f) => f(items));
}

/** True when the list survives a page reload (false in private browsing or when storage is blocked). */
export const isPersistent = () => (read(), persistent);

/** Saved coins, oldest first. Each item: { id, tk, name, img, src, at }. */
export const list = () => read().slice();
export const ids = () => read().map((x) => x.id);
export const count = () => read().length;
export const has = (id) => read().some((x) => x.id === id);

function snap(coin) {
  const id = typeof coin === "string" ? coin : coin.id;
  const c = typeof coin === "string" ? {} : coin;
  return { id, tk: c.tk || null, name: c.name || null, img: c.img || null, src: c.src === "snek" || id.startsWith("snek:") ? "snek" : "solada", at: Date.now() };
}

/** Add a coin (object from /tokens or an id). Returns false when the list is full. */
export function add(coin) {
  const items = read();
  const s = snap(coin);
  if (items.some((x) => x.id === s.id)) return true;
  if (items.length >= MAX) return false;
  write([...items, s]);
  return true;
}

export function remove(id) {
  write(read().filter((x) => x.id !== id));
}

export function toggle(coin) {
  const id = typeof coin === "string" ? coin : coin.id;
  if (has(id)) { remove(id); return false; }
  return add(coin);
}

export function clear() {
  write([]);
}

/** Refresh the stored snapshot (ticker/image) from live coin rows. */
export function refresh(coins) {
  const by = new Map((coins || []).map((c) => [c.id, c]));
  let changed = false;
  const items = read().map((x) => {
    const c = by.get(x.id);
    if (!c) return x;
    const n = { ...x, tk: c.tk || x.tk, name: c.name || x.name, img: c.img || x.img, src: c.src || x.src };
    if (n.tk !== x.tk || n.name !== x.name || n.img !== x.img || n.src !== x.src) changed = true;
    return n;
  });
  if (changed) write(items);
}

/** Subscribe to changes (this tab and other tabs). Returns an unsubscribe function. */
export function on(f) {
  subs.add(f);
  return () => subs.delete(f);
}
try {
  addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    mem = null;
    const items = read();
    subs.forEach((f) => f(items));
  });
} catch {}

export const MAX_ITEMS = MAX;

/* ---------- sharing between devices (a link, no accounts) ---------- */

/** Link to this list. Opening it on another device offers to add the coins there. */
export function shareUrl() {
  const u = new URL("./watchlist.html", location.href);
  const w = ids().join(",");
  if (w) u.searchParams.set("w", w);
  return u.toString();
}

/** Ids carried in ?w= on the current page, minus ones already saved. */
export function fromLink() {
  const w = new URLSearchParams(location.search).get("w");
  if (!w) return [];
  const ok = /^(snek:[0-9a-f]{56}\.[0-9a-f]{0,64}|[A-Za-z0-9_-]{2,80})$/;
  return [...new Set(w.split(",").map((s) => s.trim()).filter((s) => ok.test(s)))].filter((id) => !has(id));
}

/* ---------- star button ---------- */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const STAR = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8z"/></svg>`;

/**
 * Star toggle for a coin row. Renders from the saved state; `wire()` makes clicks work.
 * Pass the coin object from /tokens so the snapshot is stored with it.
 */
export function starBtn(coin, { size = "" } = {}) {
  const id = typeof coin === "string" ? coin : coin.id;
  const tk = typeof coin === "string" ? "" : coin.tk || "";
  const onList = has(id);
  const data = typeof coin === "string" ? "" : ` data-tk="${esc(coin.tk || "")}" data-name="${esc(coin.name || "")}" data-img="${esc(coin.img || "")}" data-src="${esc(coin.src || "")}"`;
  return `<button type="button" class="star ${onList ? "is-on" : ""} ${size}" data-watch-toggle="${esc(id)}"${data} aria-pressed="${onList}" title="${onList ? "Remove" : "Add"} ${esc(tk ? "$" + tk : "this coin")} ${onList ? "from" : "to"} your watchlist" aria-label="${onList ? "Remove" : "Add"} ${esc(tk || "coin")} ${onList ? "from" : "to"} watchlist">${STAR}</button>`;
}

function paintStars(root = document) {
  root.querySelectorAll("[data-watch-toggle]").forEach((b) => {
    const onList = has(b.dataset.watchToggle);
    b.classList.toggle("is-on", onList);
    b.setAttribute("aria-pressed", String(onList));
    const tk = b.dataset.tk ? "$" + b.dataset.tk : "this coin";
    b.title = `${onList ? "Remove" : "Add"} ${tk} ${onList ? "from" : "to"} your watchlist`;
  });
  root.querySelectorAll("[data-watch-count]").forEach((el) => {
    const n = count();
    el.textContent = n ? String(n) : "";
    el.hidden = !n;
  });
}

let wired = false;
/** Delegate clicks on star buttons and keep every star/count on the page in sync. */
export function wire(root = document) {
  paintStars(root);
  if (wired) return;
  wired = true;
  root.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-watch-toggle]");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const id = b.dataset.watchToggle;
    const coin = { id, tk: b.dataset.tk || null, name: b.dataset.name || null, img: b.dataset.img || null, src: b.dataset.src || null };
    const ok = toggle(coin);
    if (ok === false) toast(`Your watchlist is full (${MAX} coins). Remove one first.`);
    else if (!persistent) toast("Saved for this visit only. Your browser is blocking site storage, so the list clears when you leave.");
    else if (has(id) && count() === 1) toast(`Starred. See it on your <a href="./watchlist.html">Watchlist</a>.`, true);
  });
  on(() => paintStars(root));
}

let toastEl = null, toastTimer = 0;
function toast(html, isHtml = false) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    toastEl.setAttribute("role", "status");
    document.body.appendChild(toastEl);
  }
  if (isHtml) toastEl.innerHTML = html; else toastEl.textContent = html;
  toastEl.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("is-on"), 5000);
}

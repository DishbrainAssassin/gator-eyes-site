// Site-wide coin search and beginner mode. Loaded on every page by common.js.
import { getApi, price } from "./api.js?v=20261031w";
import { coinUrl, joinUrl } from "./data.js?v=20261031w";
import { esc, compact } from "./ui.js?v=20261031w";

const KEY = "ge-beginner";

/* ---------- Search ---------- */

let coins = null, loading = null;
async function loadCoins() {
  if (coins) return coins;
  try {
    const c = JSON.parse(sessionStorage.getItem("ge-coins") || "null");
    if (c && Date.now() - c.at < 120000) return (coins = c.list);
  } catch {}
  loading = loading || getApi("/tokens").then((j) => {
    coins = j.coins || [];
    try { sessionStorage.setItem("ge-coins", JSON.stringify({ at: Date.now(), list: coins })); } catch {}
    return coins;
  }).finally(() => (loading = null));
  return loading;
}

function score(c, q) {
  const tk = (c.tk || "").toLowerCase(), nm = (c.name || "").toLowerCase();
  const ids = [c.id, c.slug].filter(Boolean).map((x) => x.toLowerCase());
  if (tk === q || ids.includes(q)) return 100;
  if (tk.startsWith(q)) return 80;
  if (nm.startsWith(q)) return 60;
  if (tk.includes(q)) return 50;
  if (nm.includes(q)) return 40;
  if (q.length >= 8 && ids.some((x) => x.startsWith(q))) return 30;
  return 0;
}

function curve(c) {
  if (c.cs === "open") return Math.min(100, (c.prog || 0) / 100).toFixed(0) + "% to graduating";
  if (c.cs === "graduated") return "Graduated";
  return "";
}

function resultRow(c, i) {
  const tk = c.tk || "?";
  const v = c.w && c.w.h24 ? c.w.h24.v : 0;
  const img = c.img ? `<img src="${esc(c.img)}" alt="" width="32" height="32" loading="lazy">` : `<span class="sr-ph" aria-hidden="true">${esc(tk.slice(0, 1))}</span>`;
  const meta = [c.price != null ? price(c.price) + " ADA" : "", v ? compact(v) + " ADA 24h" : "No trades in 24h", curve(c)].filter(Boolean).join(" · ");
  const al = Object.keys(c.al || {}).length;
  return `<li class="sr-item" role="option" id="sr-${i}" aria-selected="false">
    <a class="sr-main" href="./tokens.html?q=${encodeURIComponent(tk)}">${img}<span><strong>${esc(tk)}</strong> <span class="sr-name">${esc((c.name || "").slice(0, 28))}</span><span class="sr-meta">${esc(meta)}</span></span></a>
    <span class="sr-acts">
      <a href="./coincard.html?coin=${encodeURIComponent(c.id)}">Card</a>
      <a href="./holders.html?coin=${encodeURIComponent(tk)}">Holders</a>
      ${al ? `<a href="./followup.html?coin=${encodeURIComponent(tk)}">Alerts</a>` : ""}
      <a href="${esc(coinUrl(c.id))}" target="_blank" rel="noopener">Solada</a>
    </span>
  </li>`;
}

function mountSearch(slot) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "hdr-btn hdr-search";
  btn.setAttribute("aria-label", "Search coins");
  btn.setAttribute("aria-haspopup", "dialog");
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span class="hdr-label">Search</span><kbd>/</kbd>`;
  slot.appendChild(btn);

  const dlg = document.createElement("div");
  dlg.className = "search-panel";
  dlg.hidden = true;
  dlg.setAttribute("role", "dialog");
  dlg.setAttribute("aria-modal", "true");
  dlg.setAttribute("aria-label", "Search coins");
  dlg.innerHTML = `<div class="search-box wrap">
    <div class="search-field">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input type="search" placeholder="Ticker, name or policy ID" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="sr-list" aria-autocomplete="list" data-sq>
      <button type="button" class="search-close" aria-label="Close search">Esc</button>
    </div>
    <ul class="sr-list" id="sr-list" role="listbox" data-sr></ul>
    <p class="sr-hint" data-sh>Search every Solada.fun coin Gator Eyes tracks.</p>
  </div>`;
  document.body.appendChild(dlg);
  const input = dlg.querySelector("[data-sq]"), list = dlg.querySelector("[data-sr]"), hint = dlg.querySelector("[data-sh]");
  let active = -1, last = null;

  const setActive = (i) => {
    const items = list.querySelectorAll(".sr-item");
    if (!items.length) return;
    active = (i + items.length) % items.length;
    items.forEach((el, k) => el.setAttribute("aria-selected", k === active));
    input.setAttribute("aria-activedescendant", items[active].id);
    items[active].scrollIntoView({ block: "nearest" });
  };

  async function run() {
    const q = input.value.trim().toLowerCase().replace(/^\$/, "");
    active = -1;
    input.removeAttribute("aria-activedescendant");
    if (!q) { list.innerHTML = ""; input.setAttribute("aria-expanded", "false"); hint.textContent = "Search every Solada.fun coin Gator Eyes tracks."; return; }
    let all;
    try { all = await loadCoins(); } catch { hint.textContent = "Couldn't load coins right now. Try again in a minute."; return; }
    if (input.value.trim().toLowerCase().replace(/^\$/, "") !== q) return;
    const hits = all.map((c) => [score(c, q), c]).filter((x) => x[0] > 0)
      .sort((a, b) => b[0] - a[0] || ((b[1].w?.h24?.v || 0) - (a[1].w?.h24?.v || 0))).slice(0, 8).map((x) => x[1]);
    list.innerHTML = hits.map(resultRow).join("");
    input.setAttribute("aria-expanded", hits.length ? "true" : "false");
    hint.textContent = hits.length ? "Enter opens the coin in the Tokens table." : `No coin matches "${input.value.trim()}".`;
    if (hits.length) setActive(0);
  }

  const open = () => {
    if (!dlg.hidden) return;
    last = document.activeElement;
    dlg.hidden = false;
    document.documentElement.classList.add("search-open");
    input.focus();
    input.select();
    loadCoins().catch(() => {});
  };
  const close = () => {
    dlg.hidden = true;
    document.documentElement.classList.remove("search-open");
    (last || btn).focus?.();
  };

  btn.addEventListener("click", open);
  dlg.querySelector(".search-close").addEventListener("click", close);
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
  input.addEventListener("input", run);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
    else if (e.key === "Enter") {
      const a = list.querySelectorAll(".sr-item")[Math.max(0, active)]?.querySelector(".sr-main");
      if (a) { e.preventDefault(); location.href = a.href; }
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !dlg.hidden) { e.preventDefault(); close(); return; }
    const t = e.target;
    const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); open(); }
  });
}

/* ---------- Beginner mode ---------- */

// Plain-English notes. Each pattern is wrapped once per page, the first time it appears.
const TERMS = [
  ["Bonding curve", /\bbonding curves?\b/i, "Every new Solada.fun coin starts here. The price goes up as people buy and down as they sell. When enough ADA is in the curve, the coin graduates."],
  ["Graduation", /\bgraduat(?:es|ed|ing|ion)\b/i, "When a coin's bonding curve fills up, it graduates and trading moves to a regular Minswap pool."],
  ["Net flow", /\bnet (?:flow|buying)\b/i, "ADA bought minus ADA sold. Above zero means more money came in than went out."],
  ["Market cap", /\bmarket cap\b/i, "Price times total supply. A rough size of the coin, not cash anyone could take out."],
  ["Whale trade", /\bwhales?\b/i, "Any single trade worth $500 or more in ADA, or a trade worth at least 5% of the coin's market cap."],
  ["Volume spike", /\b(?:volume )?spikes?\b/i, "A coin trading four times its normal pace over 15 minutes, with at least 1,500 ADA moving."],
  ["Creator sell", /\b(?:creator|dev) sells?\b/i, "The wallet that made the coin sold 100 ADA or more. It's posted as a record, not a warning. Creators sell for lots of reasons."],
  ["Fast launch", /\bfast launch(?:es)?\b/i, "A new coin that pulls in 1,000 ADA from eight or more wallets in its first hour."],
  ["Volume", /\bvolume\b/i, "All the ADA traded, buys and sells added together."],
  ["Policy ID", /\bpolicy ID\b/i, "A Cardano token's unique ID. Anyone can copy a ticker, but not a policy ID, so it's the safe way to find the right coin."],
  ["Ticker", /\btickers?\b/i, "A coin's short name, like GAEY. Tickers aren't unique, so two coins can share one."],
  ["Holders", /\bholders?\b/i, "Wallets that currently hold the coin."],
  ["Venue", /\bvenues?\b/i, "Where a trade happened: on Solada's bonding curve or in a Minswap pool after graduation."],
  ["USDCx", /\bUSDCx\b/, "A dollar-pegged stablecoin on Cardano. Gator Eyes uses it to show rough dollar values next to ADA."],
  ["Unlock", /\bunlocks?\b/i, "Some creators lock part of the supply until a set date. An unlock is when those tokens can be sold."],
  ["ADA", /\bADA\b/, "Cardano's coin. Prices, trades and volume on Gator Eyes are in ADA."],
  ["Gator Tracks", /\bGator Tracks\b/, "The daily recap, posted at 9 AM Eastern: volume, most traded coins and where the money went."],
];
const SKIP = "a, button, input, textarea, select, script, style, code, kbd, svg, .gloss, .nav, .site-header, .site-footer, .nav-tip, .gloss-tip, .search-panel, .beginner-bar, .gator, [data-no-gloss], h1";

let tip = null, glossOn = false, observer = null, seen = new Set();

function tipEl() {
  if (tip) return tip;
  tip = document.createElement("div");
  tip.className = "nav-tip gloss-tip";
  tip.id = "gloss-tip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.appendChild(tip);
  return tip;
}
function showTip(el) {
  const t = tipEl(), d = TERMS[el.dataset.term];
  if (!d) return;
  t.innerHTML = `<strong>${esc(d[0])}</strong><span>${esc(d[2])}</span>`;
  t.hidden = false;
  const r = el.getBoundingClientRect(), w = t.offsetWidth;
  const left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2));
  t.style.left = left + "px";
  t.style.top = r.bottom + 10 + "px";
  t.style.setProperty("--arrow", r.left + r.width / 2 - left + "px");
  el.setAttribute("aria-describedby", "gloss-tip");
  requestAnimationFrame(() => t.classList.add("is-on"));
}
function hideTip() { if (tip) { tip.classList.remove("is-on"); tip.hidden = true; } }

function wrapTerms(root) {
  if (seen.size >= TERMS.length) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (!n.nodeValue.trim() || n.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (let node of nodes) {
    for (let i = 0; i < TERMS.length; i++) {
      if (seen.has(i) || !node || !node.parentNode) continue;
      const m = TERMS[i][1].exec(node.nodeValue);
      if (!m) continue;
      seen.add(i);
      const after = node.splitText(m.index);
      const rest = after.splitText(m[0].length);
      const span = document.createElement("span");
      span.className = "gloss";
      span.tabIndex = 0;
      span.dataset.term = i;
      span.textContent = after.nodeValue;
      after.replaceWith(span);
      node = rest;
    }
  }
}

function unwrap() {
  document.querySelectorAll(".gloss").forEach((s) => s.replaceWith(document.createTextNode(s.textContent)));
  document.querySelector("main")?.normalize();
  seen = new Set();
}

function setBeginner(on, btn) {
  glossOn = on;
  try { on ? localStorage.setItem(KEY, "1") : localStorage.removeItem(KEY); } catch {}
  document.querySelectorAll("[data-beginner-toggle]").forEach((b) => { b.setAttribute("aria-pressed", on); b.classList.toggle("is-on", on); });
  document.documentElement.classList.toggle("beginner", on);
  const main = document.querySelector("main");
  let bar = document.querySelector(".beginner-bar");
  if (on) {
    if (!bar && main) {
      bar = document.createElement("div");
      bar.className = "beginner-bar";
      bar.innerHTML = `<div class="wrap beginner-inner"><p><strong>Beginner mode is on.</strong> Words with a dotted underline explain themselves when you point at or tap them. Still stuck? <a href="#" data-ask>Ask Quagmire</a>. New to Solada? <a href="${esc(joinUrl())}" target="_blank" rel="noopener">Start trading here</a> (our referral link).</p><button type="button" class="btn btn-ghost btn-sm" data-beginner-off>Turn off</button></div>`;
      main.prepend(bar);
      bar.querySelector("[data-beginner-off]").addEventListener("click", () => setBeginner(false));
    }
    if (main) {
      wrapTerms(main);
      let t = 0;
      observer = observer || new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => glossOn && wrapTerms(main), 300); });
      observer.observe(main, { childList: true, subtree: true });
    }
  } else {
    observer?.disconnect();
    bar?.remove();
    hideTip();
    unwrap();
  }
}

function mountBeginner(slot) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "hdr-btn hdr-beginner";
  btn.dataset.beginnerToggle = "";
  btn.setAttribute("aria-pressed", "false");
  btn.title = "Plain-English notes on terms like bonding curve, graduation and net flow";
  btn.innerHTML = `<span class="hdr-q" aria-hidden="true">?</span><span class="hdr-label">Beginner</span>`;
  btn.setAttribute("aria-label", "Beginner mode");
  slot.appendChild(btn);
  btn.addEventListener("click", () => setBeginner(!glossOn));

  // Footer switch too, so phone users can find it.
  const fnav = document.querySelector(".site-footer nav");
  if (fnav) {
    const f = document.createElement("button");
    f.type = "button";
    f.className = "footer-beginner";
    f.dataset.beginnerToggle = "";
    f.setAttribute("aria-pressed", "false");
    f.textContent = "Beginner mode";
    f.addEventListener("click", () => setBeginner(!glossOn));
    fnav.appendChild(f);
  }

  document.addEventListener("pointerover", (e) => { const g = e.target.closest?.(".gloss"); if (g && e.pointerType !== "touch") showTip(g); });
  document.addEventListener("pointerout", (e) => { if (e.target.closest?.(".gloss")) hideTip(); });
  document.addEventListener("click", (e) => {
    const g = e.target.closest?.(".gloss");
    if (g) { tip && !tip.hidden && tip.dataset.for === g.dataset.term ? hideTip() : (showTip(g), (tipEl().dataset.for = g.dataset.term)); }
    else hideTip();
  });
  document.addEventListener("focusin", (e) => { if (e.target.classList?.contains("gloss")) showTip(e.target); });
  document.addEventListener("focusout", (e) => { if (e.target.classList?.contains("gloss")) hideTip(); });
  addEventListener("scroll", hideTip, { passive: true });

  let on = false;
  try { on = localStorage.getItem(KEY) === "1"; } catch {}
  if (on) setBeginner(true);
}

export function mountExtras() {
  const inner = document.querySelector(".site-header .header-inner");
  if (!inner || inner.querySelector(".hdr-tools")) return;
  const slot = document.createElement("div");
  slot.className = "hdr-tools";
  const nav = inner.querySelector(".nav");
  nav ? nav.after(slot) : inner.appendChild(slot);
  mountSearch(slot);
  mountBeginner(slot);
}

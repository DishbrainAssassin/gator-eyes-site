// Ask Quagmire on the website. Quagmire has one brain: the Gator Eyes worker answers every question
// (POST /quag), the same code that answers /ask in Discord, so the site and Discord can never drift apart.
// This file is only the chat window and the "new race up" bubble.
import { CONFIG } from "./config.js?v=20261102-usdcx2";
import { API, getApi } from "./api.js?v=20261102-usdcx2";
import { esc } from "./ui.js?v=20261102-usdcx2";

const SITE = "https://www.gatoreyes.fun/";
const OFFLINE = `I can't reach my notes right now. Give it a minute and ask again, or ask in <a href="${esc(CONFIG.discord)}" target="_blank" rel="noopener">the Discord</a>.`;

// The worker logs the question and answer for the daily review (no names, IPs or wallets).
async function answerFollowUp(q, prev) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(API + "/quag", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ q, prev: prev || "", pg: location.pathname }), signal: ctl.signal });
    const j = await r.json().catch(() => null);
    if (!j || typeof j.html !== "string") return OFFLINE;
    // Gator Eyes pages open on whichever host you're on (preview or live).
    return j.html.split('href="' + SITE).join('href="./');
  } catch { return OFFLINE; } finally { clearTimeout(tm); }
}
const answer = (q) => answerFollowUp(q, "");

// ---------- Gator Run Downs bubble ----------
// Races open right now come from the Gator Eyes worker's /rundowns (it reads gatorrundowns.fun and caches it).
let rdCache = null, rdAt = 0;
async function rdData() {
  if (rdCache && Date.now() - rdAt < 20000) return rdCache;
  rdCache = await getApi("/rundowns");
  rdAt = Date.now();
  return rdCache;
}
const RD_SITE = "https://gatorrundowns.fun";
const rdEt = (ms) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(ms));
const rdOpen = (d) => ((d && d.open) || []).filter((x) => !x.called && x.closesAt > Date.now());

// ---------- widget ----------
const SUGGEST = ["What do the alerts mean?", "What's close to graduating?", "Any Run Downs races open?", "Most traded today", "How do I make a holder list?", "What is net flow?"];
const KEY = "gator-chat-v1";

export function mountGator() {
  if (!document.querySelector(".site-header") || document.querySelector(".gator-launch")) return;
  const root = document.createElement("div");
  root.className = "gator";
  root.innerHTML = `
    <button class="gator-launch" type="button" aria-expanded="false" aria-controls="gator-panel">
      <img src="./assets/img/gator-nerd-head-160.webp" alt="" width="48" height="48"><span>Ask Quagmire</span>
    </button>
    <section class="gator-panel" id="gator-panel" role="dialog" aria-label="Ask Quagmire" hidden>
      <header class="gator-head">
        <img src="./assets/img/gator-nerd-head-160.webp" alt="" width="40" height="40">
        <div><strong>Quagmire</strong><span>Answers about Gator Eyes, Solada.fun and Snek.fun</span></div>
        <button type="button" class="gator-x" aria-label="Close">×</button>
      </header>
      <div class="gator-log" aria-live="polite"></div>
      <div class="gator-chips"></div>
      <form class="gator-form">
        <input type="text" name="q" maxlength="200" placeholder="Ask about a coin, alerts, tools…" autocomplete="off" aria-label="Your question">
        <button type="submit" class="btn btn-amber btn-sm">Ask</button>
      </form>
      <p class="gator-note" style="margin:0;padding:0 16px 10px;font-size:12px;color:var(--color-text-muted)">Questions and answers are saved to help Quagmire learn. No account details, IP addresses or connected-wallet information are added to the log. Please don’t include personal information.</p>
    </section>`;
  document.body.appendChild(root);
  const btn = root.querySelector(".gator-launch"), panel = root.querySelector(".gator-panel");
  const log = root.querySelector(".gator-log"), chips = root.querySelector(".gator-chips");
  const form = root.querySelector(".gator-form"), input = form.querySelector("input");

  let hist = [];
  try { hist = JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch {}
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(hist.slice(-30))); } catch {} };
  const add = (who, html, keep = true) => {
    const m = document.createElement("div");
    m.className = "gator-msg " + (who === "me" ? "is-me" : "is-gator");
    m.innerHTML = who === "me" ? esc(html) : html;
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
    if (keep) { hist.push([who, html]); save(); }
    return m;
  };
  const greet = () => add("gator", "Hi, I'm Quagmire, the Gator Eyes gator. I read every trade on Solada.fun and Snek.fun so you don't have to. I've got numbers on everything. Ask me about a coin (try its ticker), the alerts, or how to use the tools.", false);
  greet();
  for (const [w, h] of hist) add(w, h, false);
  chips.innerHTML = SUGGEST.map((s) => `<button type="button" class="gator-chip">${esc(s)}</button>`).join("");

  const ask = async (q) => {
    q = q.trim();
    if (!q) return;
    const prev = [...hist].reverse().find(([w]) => w === "me")?.[1] || "";
    add("me", q);
    chips.hidden = true;
    const wait = add("gator", '<span class="gator-dots"><i></i><i></i><i></i></span>', false);
    let html;
    try { html = await answerFollowUp(q, prev); } catch { html = "Something went wrong on my end. Try again in a minute."; }
    wait.remove();
    add("gator", html);
  };
  let opener = btn;
  const open = (on) => {
    if (on && panel.hidden) opener = document.activeElement;
    panel.hidden = !on;
    btn.setAttribute("aria-expanded", on);
    root.classList.toggle("is-open", on);
    if (on) { log.scrollTop = log.scrollHeight; if (matchMedia("(pointer: fine)").matches) input.focus(); }
    else (opener?.isConnected ? opener : document.querySelector("[data-ask]") || btn).focus();
  };
  if (hist.length) chips.hidden = true;
  watchRaces(root, panel);
  btn.addEventListener("click", () => open(panel.hidden));
  root.querySelector(".gator-x").addEventListener("click", () => open(false));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) open(false); });
  chips.addEventListener("click", (e) => { const b = e.target.closest(".gator-chip"); if (b) ask(b.textContent); });
  form.addEventListener("submit", (e) => { e.preventDefault(); const q = input.value; input.value = ""; ask(q); });
  // Any element with data-ask opens the chat; a value asks that question.
  document.addEventListener("click", (e) => {
    const t = e.target.closest?.("[data-ask]");
    if (!t) return;
    e.preventDefault();
    if (panel.hidden) open(true);
    if (t.dataset.ask) ask(t.dataset.ask);
    else input.focus();
  });
}


// "New race up" bubble: when a Gator Run Downs race is open for picks, Quagmire shows its Paddock link above the
// chat corner. Checks once a minute while the tab is visible. Closing it hides that race; the next race shows again.
const RACE_SEEN = "ge-race-seen";
function watchRaces(root, panel) {
  if (!document.getElementById("gator-race-css")) {
    // Styles live here so a cached style.css can't leave the bubble unstyled.
    const st = document.createElement("style");
    st.id = "gator-race-css";
    st.textContent = `.gator-race { display: flex; align-items: flex-start; gap: var(--space-2); max-width: min(340px, calc(100vw - 2 * var(--space-5))); padding: var(--space-3); border: 1px solid var(--color-amber); border-radius: var(--radius-lg, 14px); background: var(--color-surface); color: var(--color-text); font-size: var(--text-sm); line-height: 1.4; box-shadow: 0 10px 28px rgba(0,0,0,.45); }
.gator-race[hidden] { display: none; }
.gator-race img { flex: none; width: 36px; height: 36px; border-radius: 50%; background: #1b2a1c; object-fit: cover; }
.gator-race p { margin: 0; }
.gator-race a { color: var(--color-amber); font-weight: 700; }
.gator-race-x { flex: none; width: 28px; height: 28px; margin: -4px -4px 0 0; border: 0; border-radius: 50%; background: none; color: var(--color-text-muted); font-size: 20px; line-height: 1; cursor: pointer; }
.gator-race-x:hover { color: var(--color-text); }
.gator.is-open .gator-race { display: none; }`;
    document.head.appendChild(st);
  }
  const box = document.createElement("aside");
  box.className = "gator-race";
  box.setAttribute("aria-label", "Gator Run Downs");
  box.hidden = true;
  root.appendChild(box);
  let shown = null;
  const seen = () => { try { return localStorage.getItem(RACE_SEEN) || ""; } catch { return ""; } };
  const check = async () => {
    if (document.hidden) return;
    let d = null;
    try { d = await rdData(); } catch { d = null; }
    const open = rdOpen(d).filter((x) => x.closesAt - Date.now() > 30000);
    const x = open[0];
    if (!x || x.coinId === seen() || !panel.hidden) { box.hidden = true; shown = null; return; }
    if (shown !== x.coinId) {
      box.innerHTML = `<img src="./assets/img/gator-nerd-head-160.webp" alt="" width="36" height="36"><p><strong>New race up:</strong> $${esc(x.ticker || "?")} is in the Paddock. Picks close ${esc(rdEt(x.closesAt))} ET${open.length > 1 ? ` (+${open.length - 1} more)` : ""}. <a href="${esc(d.play || RD_SITE + "/paddock.html")}" target="_blank" rel="noopener">Pick at Gator Run Downs</a></p><button type="button" class="gator-race-x" aria-label="Hide until the next race">×</button>`;
      box.querySelector(".gator-race-x").addEventListener("click", () => { try { localStorage.setItem(RACE_SEEN, x.coinId); } catch {} box.hidden = true; shown = null; });
      shown = x.coinId;
    }
    box.hidden = false;
  };
  check();
  setInterval(check, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  new MutationObserver(() => { if (!panel.hidden) box.hidden = true; else check(); }).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
}

// Exposed for testing.
export { answer, answerFollowUp };

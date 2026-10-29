// Ask Gator: a small helper that answers common questions about Gator Eyes and
// Solada.fun. Answers are built in (no AI, no running cost). Live questions
// about coins use the same /tokens data as the Tokens page.
import { CONFIG } from "./config.js?v=20261029k";
import { coinUrl, joinUrl } from "./data.js?v=20261029k";
import { getApi, price, pct, signed, hours, span } from "./api.js?v=20261029k";
import { esc, fmt, compact } from "./ui.js?v=20261029k";

const DISCORD = CONFIG.discord;
const a = (href, label, ext) => `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${esc(label)}</a>`;
const page = (p, label) => a("./" + p, label);
const discord = (label = "the Discord") => a(DISCORD, label, true);

// ---------- live data ----------
let tok = null, tokAt = 0;
async function tokens() {
  if (tok && Date.now() - tokAt < 60000) return tok;
  tok = await getApi("/tokens");
  tokAt = Date.now();
  return tok;
}
const h24 = (c) => c.w.h24 || { v: 0, n: 0, net: 0, wal: 0, ch: null };
const tk = (c) => "$" + (c.tk || "?");

function coinAnswer(c) {
  const w = h24(c);
  const bits = [`<strong>${esc(tk(c))}</strong>${c.name ? " (" + esc(c.name) + ")" : ""}, last 24 hours:`];
  const list = [];
  list.push(`Price ${esc(price(c.price))} ADA${w.ch != null ? ", " + esc(pct(w.ch)) : ""}`);
  list.push(`${fmt(w.v)} ADA traded in ${fmt(w.n)} trades by ${fmt(w.wal)} wallets`);
  list.push(`Net flow ${esc(signed(w.net))} ADA (${w.net >= 0 ? "more bought than sold" : "more sold than bought"})`);
  if (c.mc) list.push(`Market cap about ${compact(c.mc)} ADA${c.hold ? ", " + fmt(c.hold) + " holders" : ""}`);
  if (c.cs === "open" && c.prog != null) {
    const p = c.pace || {};
    list.push(`${(c.prog / 100).toFixed(1)}% of the way to graduating, ${fmt(p.need)} ADA to go${p.etaH != null ? ", " + esc(hours(p.etaH)) + " at the last 6 hours' pace" : ", not moving closer right now"}`);
  } else if (c.cs === "graduated") list.push(`Graduated to Minswap${c.gAt && c.born ? " after " + esc(span(c.gAt - c.born)) : ""}`);
  const al = Object.entries(c.al || {}).map(([k, n]) => `${n} ${{ big: "whale", spike: "volume spike", launch: "fast launch", dev: "creator sell" }[k] || k}`);
  list.push(al.length ? `Alerts today: ${al.join(", ")}` : "No Gator Eyes alerts in the last 24 hours");
  bits.push("<ul>" + list.map((x) => `<li>${x}</li>`).join("") + "</ul>");
  bits.push(`${a(coinUrl(c.id), "Open on Solada.fun", true)} · ${page("coincard.html?coin=" + encodeURIComponent(c.id), "Share card")} · ${page("followup.html?coin=" + encodeURIComponent(c.tk || c.id), "Alert follow-up")} · ${page("holders.html?coin=" + encodeURIComponent(c.tk || c.id), "Holders")}`);
  bits.push(`<small>Just the numbers, not advice.</small>`);
  return bits.join("");
}

function top(list, n, line) {
  return "<ol>" + list.slice(0, n).map((c) => `<li>${line(c)}</li>`).join("") + "</ol>";
}
const coinLink = (c) => `<strong>${a(coinUrl(c.id), tk(c), true)}</strong>`;

const LIVE = [
  {
    keys: ["graduat", "close to", "closest", "race", "bonding", "curve", "eta", "almost"],
    not: ["what is", "what's a", "what does", "how does", "mean"],
    run: async () => {
      const d = await tokens();
      const open = d.coins.filter((c) => c.cs === "open" && c.prog != null).sort((x, y) => y.prog - x.prog);
      if (!open.length) return "Nothing is on the bonding curve right now.";
      return `Closest to graduating right now:${top(open, 5, (c) => `${coinLink(c)} ${(c.prog / 100).toFixed(1)}%${c.pace && c.pace.etaH != null ? ", " + esc(hours(c.pace.etaH)) + " to go" : ", not moving closer"}`)}Full list with pace on the ${page("race.html", "Race page")}.`;
    },
  },
  {
    keys: ["most traded", "top volume", "highest volume", "busiest", "hot", "trending", "popular", "top coins", "biggest coins", "most volume"],
    run: async () => {
      const d = await tokens();
      const l = [...d.coins].sort((x, y) => h24(y).v - h24(x).v);
      return `Most traded in the last 24 hours:${top(l, 5, (c) => `${coinLink(c)} ${fmt(h24(c).v)} ADA, net ${esc(signed(h24(c).net))}`)}Sort it any way you like on the ${page("tokens.html", "Tokens page")}.`;
    },
  },
  {
    keys: ["inflow", "money in", "money going", "being bought", "most bought", "buying most", "net buy", "accumulat"],
    run: async () => {
      const d = await tokens();
      const l = d.coins.filter((c) => h24(c).net > 0).sort((x, y) => h24(y).net - h24(x).net);
      if (!l.length) return "No coin has more buying than selling in the last 24 hours.";
      return `Biggest net buying in the last 24 hours:${top(l, 5, (c) => `${coinLink(c)} ${esc(signed(h24(c).net))} ADA`)}Hour-by-hour detail is on the ${page("flows.html", "Flows page")}.`;
    },
  },
  {
    keys: ["outflow", "money out", "being sold", "most sold", "selling most", "dump"],
    run: async () => {
      const d = await tokens();
      const l = d.coins.filter((c) => h24(c).net < 0).sort((x, y) => h24(x).net - h24(y).net);
      if (!l.length) return "No coin has more selling than buying in the last 24 hours.";
      return `Biggest net selling in the last 24 hours:${top(l, 5, (c) => `${coinLink(c)} ${esc(signed(h24(c).net))} ADA`)}`;
    },
  },
  {
    keys: ["new coin", "newest", "just launched", "new launch", "latest coin", "recent launch", "new token"],
    run: async () => {
      const d = await tokens();
      const l = d.coins.filter((c) => c.born && Date.now() - c.born < 2 * 864e5).sort((x, y) => y.born - x.born);
      if (!l.length) return "No new coins in the last two days that have traded.";
      return `Newest coins that have traded:${top(l, 5, (c) => `${coinLink(c)} ${esc(span(Date.now() - c.born))} old, ${fmt(h24(c).v)} ADA traded`)}Fast starters get posted in #fast-launch on ${discord()}.`;
    },
  },
  {
    keys: ["recently graduated", "just graduated", "who graduated", "graduated today", "graduated this week"],
    run: async () => {
      const d = await tokens();
      const l = d.coins.filter((c) => c.cs === "graduated" && c.gAt && Date.now() - c.gAt < 7 * 864e5).sort((x, y) => y.gAt - x.gAt);
      if (!l.length) return "No coins graduated in the last 7 days.";
      return `Graduated this week:${top(l, 6, (c) => `${coinLink(c)}${c.born ? " took " + esc(span(c.gAt - c.born)) : ""}`)}`;
    },
  },
  {
    keys: ["solada today", "volume today", "how is solada", "how's solada", "market today", "total volume", "overall"],
    run: async () => {
      const d = await tokens();
      let v = 0, n = 0, net = 0;
      for (const c of d.coins) { const w = h24(c); v += w.v; n += w.n; net += w.net; }
      return `In the last 24 hours on Solada.fun: <strong>${fmt(v)} ADA</strong> traded${d.adaUsd ? ` (~${fmt(v * d.adaUsd)} USDCx)` : ""} across ${fmt(n)} trades. Net flow ${esc(signed(net))} ADA. Today's full picture is on the ${page("flows.html", "Flows page")}.`;
    },
  },
];

// ---------- built-in answers ----------
const FAQ = [
  { keys: ["what is gator eyes", "what's gator eyes", "what does gator eyes", "about gator eyes", "who are you", "what are you", "what is this site", "what is this"], a: () => `I'm Quagmire, resident data nerd at Gator Eyes. Gator Eyes is a free, automated tracker for Solada.fun. It reads every public trade every two minutes, adds up where the money moves, and posts what stands out to ${discord()} and X. No sign-up, no wallet connection.` },
  { keys: ["alerts mean", "types of alert", "what alerts", "alert types", "kinds of alert", "what triggers", "alert rules"], a: () => `Four kinds of alert:<ul><li><strong>Whale trade</strong>: a trade of 1,000 ADA or more, or one worth at least 5% of the coin's market cap.</li><li><strong>Volume spike</strong>: a coin trading 4 times its normal pace over 15 minutes, with at least 1,500 ADA moving.</li><li><strong>Fast launch</strong>: a new coin pulling in 1,000 ADA from 8 or more wallets in its first hour.</li><li><strong>Creator sell</strong>: the wallet that created a coin selling 100 ADA or more. Posted as a record, not a warning.</li></ul>More on the ${page("about.html", "How it works page")}.` },
  { keys: ["whale"], a: () => `A whale alert is any single trade of 1,000 ADA or more, or a trade worth at least 5% of the coin's market cap. They post in #whale-alerts on ${discord()}.` },
  { keys: ["spike"], a: () => "A volume spike means a coin traded at 4 times its normal pace over 15 minutes, with at least 1,500 ADA moving. Each coin can spike at most once an hour so the channel doesn't flood." },
  { keys: ["fast launch"], a: () => `A fast launch is a new coin that pulls in 1,000 ADA from 8 or more different wallets in its first hour. They post in #fast-launch on ${discord()}.` },
  { keys: ["creator sell", "dev sell", "creator wallet", "dev wallet", "rug"], a: () => `A creator sell is the wallet that made a coin selling 100 ADA or more. It's posted for transparency, not as a warning. Creators sell for lots of reasons. Gator Eyes doesn't rate coins or call rugs. For a safety check, a tool like ${a("https://suriradar.fun/", "Suri Radar", true)} is built for that.` },
  { keys: ["gator tracks", "daily recap", "recap"], a: () => `Gator Tracks is the daily recap: volume, most traded coins and where the money went, for the previous day midnight to midnight Eastern. It posts at 9 AM Eastern in #gator-tracks and on ${a(CONFIG.x, "X", true)}. Make your own day image with the ${page("card.html", "daily flow card")}.` },
  { keys: ["pulse", "every 4 hours", "x posts", "twitter"], a: () => `On ${a(CONFIG.x, "X (@GatorEyesSolada)", true)} Gator Eyes posts a Solada Pulse every 4 hours (12, 4 and 8, AM and PM Eastern): volume, most traded, biggest inflow, spikes, fast starts, new coins and the biggest trade. Instant alerts stay on Discord.` },
  { keys: ["discord", "channel", "join", "community"], a: () => `${discord("Join the Discord")} for instant alerts. Channels: #whale-alerts (big trades and volume spikes), #fast-launch, #creator-sells, #gator-tracks (daily recap) and #gaey-trades. #alerts-overview explains them all.` },
  { keys: ["net flow", "netflow", "inflow mean"], a: () => "Net flow is ADA bought minus ADA sold. +500 means buyers put in 500 ADA more than sellers took out. It shows direction, not price, and big trades can swing it." },
  { keys: ["what is graduat", "what does graduat", "graduation mean", "what is a bonding", "what's a bonding", "bonding curve", "how does graduat", "graduate mean"], a: () => `New Solada.fun coins start on a bonding curve, where price rises as people buy. When enough ADA is in the curve (about 10,344 ADA), the coin graduates and moves to a Minswap pool. The ${page("race.html", "Race page")} shows who's closest.` },
  { keys: ["eta", "pace", "to go"], a: () => "The ETA on the Race page takes the last 6 hours of net buying on the curve and asks how long it would take to fill the rest at that pace. It changes fast and isn't a prediction. \"Not moving closer\" means more was sold than bought in that time." },
  { keys: ["follow-up", "follow up", "followup", "track record", "accurate", "do alerts work", "after an alert"], a: () => `The ${page("followup.html", "Follow-up page")} shows every alert and what the coin's price did 1 hour and 24 hours later. Good and bad, nothing hidden. It's there so you can judge the alerts yourself.` },
  { keys: ["holder", "airdrop", "snapshot", "csv"], a: () => `Use the ${page("holders.html", "Holder snapshot")}: type a ticker, then set rules. It leaves out the bonding curve, pools, locked tokens, other contracts and the creator wallet, and can group addresses by wallet. Add a minimum balance, top-N or a "hasn't sold since" date, then download the CSV.` },
  { keys: ["share card", "coin card", "image of", "picture", "graphic"], a: () => `The ${page("coincard.html", "Coin share card")} makes a ready-to-post image of any coin's last 24 hours. Pick a coin, then tap Download PNG (or Save image on a phone) and Copy caption. For the whole market, use the ${page("card.html", "daily flow card")}.` },
  { keys: ["tokens page", "tokens table", "table", "all coins", "list of coins"], a: () => `The ${page("tokens.html", "Tokens page")} lists every coin on Solada.fun with price, change, volume, trades, net flow, market cap, curve progress and alerts. Switch between Live (15 min), 1h, 6h and 24h, and click a column to sort.` },
  { keys: ["flows", "by hour", "venue"], a: () => `The ${page("flows.html", "Flows page")} shows where the ADA went today: money in and out by coin, by hour and by venue (Solada curve, Minswap, Splash, Pump.fun). Days run midnight to midnight Eastern.` },
  { keys: ["widget", "embed", "my site", "my website"], a: () => `Run a project? Put a live box with your coin's volume, net flow and latest alerts on your own site. The embed code is on the ${page("about.html#embed", "How it works page")}.` },
  { keys: ["api", "json", "feed url", "data for", "builder", "developer"], a: () => `Gator Eyes' data feed only powers this site. To show live Solada numbers on your own site, use the embed widget on the ${page("about.html#embed", "How it works page")}.` },
  { keys: ["gaey", "your token", "team token"], a: () => `$GAEY is the Gator Eyes team's own token on Solada.fun. Holder rewards are paid in ADA, and the creator locked 4.94M GAEY until Nov 26. Every trade posts in #gaey-trades. See the ${page("gaey.html", "$GAEY page")}.` },
  { keys: ["referral", "6pxznt5n", "ref code"], a: () => "Solada.fun links from Gator Eyes include our referral code, 6pxznt5n. It may earn the team referral rewards and costs you nothing extra." },
  { keys: ["usdcx", "usd", "dollar"], a: () => "The ~USDCx figures are approximate. They use the latest ADA to USDCx rate Gator Eyes saw, so treat them as a rough guide." },
  { keys: ["how often", "update", "refresh", "delay", "real time", "realtime", "live"], a: () => "Gator Eyes checks Solada.fun every two minutes. Alerts usually land within a few minutes of the trade. If Solada is down or updating, alerts pause and the site says so at the top." },
  { keys: ["cost", "free", "price of gator", "pay", "subscription", "premium", "charge", "paywall", "how much", "fee", "pro version", "token gate", "need to hold"], a: () => "Gator Eyes is free, and it always will be. We will never charge for access: no paywall, no subscriptions, no premium alerts, no token gate. You don't need to hold $GAEY to use anything. No sign-up or wallet connection either. Trust me, I ran the numbers on this one." },
  { keys: ["wallet", "connect", "safe to use", "private key", "seed"], a: () => "Gator Eyes never asks you to connect a wallet and can't trade for you. Never share your seed phrase with anyone, including bots in Discord DMs." },
  { keys: ["what is solada", "solada.fun", "how to buy", "how do i buy", "start trading", "how do i trade"], a: () => `Solada.fun is a launchpad for meme coins on Cardano, with some coins also on Solana. You buy and sell on Solada.fun itself; Gator Eyes just watches. ${a(joinUrl(), "Start on Solada.fun", true)}.` },
  { keys: ["solana", "dual", "pump.fun", "pumpfun"], a: () => "Gator Eyes counts Solada.fun trades on Cardano (the Solada curve, Minswap and Splash) plus Pump.fun trades of Solada coins that are also on Solana. Holder snapshots are Cardano-side only." },
  { keys: ["eastern", "time zone", "timezone", "midnight"], a: () => "All times on Gator Eyes are Eastern (New York). Days run midnight to midnight Eastern." },
  { keys: ["contact", "bug", "suggest", "idea", "feedback", "who made", "who runs", "owner"], a: () => `Ideas or bugs? Drop them in ${discord()}. The team reads everything.` },
  { keys: ["suri"], a: () => `${a("https://suriradar.fun/", "Suri Radar", true)} is built for checking coin safety. Gator Eyes sticks to reporting what traded.` },
];

const ADVICE = ["should i buy", "should i sell", "good buy", "will it pump", "will it moon", "going to moon", "price prediction", "is it safe", "worth buying", "next 100x", "gem", "financial advice", "invest in"];

const norm = (s) => " " + s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9$.' -]+/g, " ").replace(/\s+/g, " ") + " ";

async function findCoin(q) {
  const d = await tokens().catch(() => null);
  if (!d) return null;
  const words = new Set(q.toUpperCase().match(/\$?[A-Z0-9]{2,12}/g)?.map((w) => w.replace("$", "")) || []);
  const skip = new Set(["THE", "IS", "IT", "ON", "TO", "OF", "AND", "HOW", "WHAT", "ADA", "ETA", "CSV", "API", "USD", "NET", "TOP", "NEW", "DEV", "BUY", "SELL", "SHOW", "FOR", "ME", "MY", "DO", "YOU", "ARE", "CAN", "TODAY", "COIN", "COINS", "X", "SITE", "DOING", "ABOUT", "TELL", "GATOR", "EYES"]);
  const hits = d.coins.filter((c) => c.tk && words.has(c.tk.toUpperCase()) && (!skip.has(c.tk.toUpperCase()) || q.includes("$" + c.tk)));
  if (!hits.length) return null;
  // Same ticker on more than one coin: take the busier one.
  return hits.sort((x, y) => h24(y).v - h24(x).v)[0];
}

async function answer(raw) {
  const q = norm(raw);
  if (/^ ?(hi|hey|hello|yo|sup|gm|howdy)\b/.test(q.trim()) && q.trim().split(" ").length <= 3) return "Oh, hi. <em>pushes up glasses</em> Ask me about the alerts, a coin by its ticker, what's close to graduating, or how to use the tools. I have data on all of it.";
  if (/\b(thanks|thank you|thx|ty)\b/.test(q)) return "Happy to help. I'll be here, recalculating.";
  const advice = ADVICE.some((k) => q.includes(k));
  const coin = await findCoin(raw);
  if (advice) return `I just crunch the numbers, I can't tell you what to buy or sell. Gator Eyes reports what traded, not what to do next.${coin ? " Here's what " + esc(tk(coin)) + " has been doing:<br><br>" + coinAnswer(coin) : ""}`;
  if (coin && !/\b(what is|what's|how do|how does)\b/.test(q)) return coinAnswer(coin);

  const score = (keys, not = []) => (not.some((k) => q.includes(k)) ? 0 : keys.reduce((s, k) => s + (q.includes(k) ? k.length : 0), 0));
  let best = null, bestS = 0;
  for (const it of LIVE) { const s = score(it.keys, it.not); if (s > bestS) { best = it; bestS = s; } }
  for (const it of FAQ) { const s = score(it.keys); if (s > bestS) { best = it; bestS = s; } }
  if (coin && !best) return coinAnswer(coin);
  if (best) {
    try { return best.run ? await best.run() : best.a(); }
    catch { return "My data feed isn't answering right now. Give it a minute and ask again."; }
  }
  return `Hmm, that's not in my notes yet. Try a coin ticker like $MEPE, or ask about the alerts, graduation, net flow, holder snapshots or share cards. For anything else, ask in ${discord()}.`;
}

// ---------- widget ----------
const SUGGEST = ["What do the alerts mean?", "What's close to graduating?", "Most traded today", "How do I make a holder list?", "What is net flow?"];
const KEY = "gator-chat-v1";

export function mountGator() {
  if (document.querySelector(".gator-launch") || window.self !== window.top) return;
  const root = document.createElement("div");
  root.className = "gator";
  root.innerHTML = `
    <button class="gator-launch" type="button" aria-expanded="false" aria-controls="gator-panel">
      <img src="./assets/img/gator-nerd-head-160.webp" alt="" width="48" height="48"><span>Ask Quagmire</span>
    </button>
    <section class="gator-panel" id="gator-panel" role="dialog" aria-label="Ask Quagmire" hidden>
      <header class="gator-head">
        <img src="./assets/img/gator-nerd-head-160.webp" alt="" width="40" height="40">
        <div><strong>Quagmire</strong><span>Answers about Gator Eyes and Solada.fun</span></div>
        <button type="button" class="gator-x" aria-label="Close">×</button>
      </header>
      <div class="gator-log" aria-live="polite"></div>
      <div class="gator-chips"></div>
      <form class="gator-form">
        <input type="text" name="q" maxlength="200" placeholder="Ask about a coin, alerts, tools…" autocomplete="off" aria-label="Your question">
        <button type="submit" class="btn btn-amber btn-sm">Ask</button>
      </form>
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
  const greet = () => add("gator", "Hi, I'm Quagmire, the Gator Eyes gator. I read every trade on Solada.fun so you don't have to. I've got numbers on everything. Ask me about a coin (try its ticker), the alerts, or how to use the tools.", false);
  greet();
  for (const [w, h] of hist) add(w, h, false);
  chips.innerHTML = SUGGEST.map((s) => `<button type="button" class="gator-chip">${esc(s)}</button>`).join("");

  const ask = async (q) => {
    q = q.trim();
    if (!q) return;
    add("me", q);
    chips.hidden = true;
    const wait = add("gator", '<span class="gator-dots"><i></i><i></i><i></i></span>', false);
    let html;
    try { html = await answer(q); } catch { html = "Something went wrong on my end. Try again in a minute."; }
    wait.remove();
    add("gator", html);
  };
  const open = (on) => {
    panel.hidden = !on;
    btn.setAttribute("aria-expanded", on);
    root.classList.toggle("is-open", on);
    if (on) { log.scrollTop = log.scrollHeight; if (matchMedia("(pointer: fine)").matches) input.focus(); }
    else btn.focus();
  };
  if (hist.length) chips.hidden = true;
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

// Exposed for testing.
export { answer };

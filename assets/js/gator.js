// Ask Gator: a small helper that answers common questions about Gator Eyes and
// the launchpads it tracks (Solada.fun and Snek.fun). Answers are built in (no AI, no running cost). Live questions
// about coins use the same /tokens data as the Tokens page.
import { CONFIG } from "./config.js?v=20261101-nav1";
import { coinUrl, joinUrl } from "./data.js?v=20261101-nav1";
import { API, getApi, price, pct, signed, hours, span } from "./api.js?v=20261101-nav1";
import { esc, fmt, compact } from "./ui.js?v=20261101-nav1";

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

const NON_ADA = { JUSTQ: "$JUSTQ trades on the Solana side (PumpSwap, paired with USDC), not in ADA, so Gator Eyes can't count those trades itself." };
const noAda = (c) => NON_ADA[(c.tk || "").toUpperCase()] || null;
const hasTrades = (c) => !!(c.w && c.w.h24 && c.w.h24.n);
// Solana side: coins that also trade on Pump.fun/PumpSwap (kind "pump") can trade in SOL or USDC,
// which the ADA tracker can't see. DexScreener has the last 24 hours for those pools. Short timeout so
// Discord's 3-second limit is safe; on any error we just skip it.
var SOL_CACHE = new Map();
async function solSide(c, adaUsd) {
  if (!c || c.kind !== "pump" || hasTrades(c) || !c.slug || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(c.slug)) return null;
  var hit = SOL_CACHE.get(c.slug);
  if (hit && Date.now() - hit.at < 60000) return hit.v;
  var v = null;
  try {
    var ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 1500);
    var r = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + c.slug, { signal: ctl.signal });
    clearTimeout(tm);
    var j = r.ok ? await r.json() : null;
    var ps = ((j && j.pairs) || []).filter((x) => x.chainId === "solana" && x.baseToken && x.baseToken.address === c.slug);
    ps.sort((x, y) => ((y.volume && y.volume.h24) || 0) - ((x.volume && x.volume.h24) || 0));
    var pr = ps[0];
    if (pr) {
      var t = (pr.txns && pr.txns.h24) || {}, vUsd = (pr.volume && pr.volume.h24) || 0;
      v = { b: t.buys || 0, s: t.sells || 0, vUsd, vAda: adaUsd ? vUsd / adaUsd : null, ch: pr.priceChange ? pr.priceChange.h24 : null,
        dex: { pumpswap: "PumpSwap", pumpfun: "Pump.fun", raydium: "Raydium", meteora: "Meteora", orca: "Orca" }[pr.dexId] || pr.dexId,
        quote: (pr.quoteToken && pr.quoteToken.symbol) || "SOL", url: pr.url || null };
    }
  } catch (e) { v = null; }
  SOL_CACHE.set(c.slug, { at: Date.now(), v });
  if (SOL_CACHE.size > 200) SOL_CACHE.delete(SOL_CACHE.keys().next().value);
  return v;
}
function solLine(sw) {
  var n = sw.b + sw.s;
  if (!n) return "No trades on the Solana side in the last 24 hours either";
  var usd = sw.vUsd >= 100 ? Math.round(sw.vUsd).toLocaleString("en-US") : sw.vUsd.toFixed(2);
  return `On Solana (${esc(sw.dex)}, paired with ${esc(sw.quote)}): ${fmt(n)} trades, ${fmt(sw.b)} buys and ${fmt(sw.s)} sells, about $${usd} traded${sw.vAda ? " (~" + fmt(sw.vAda) + " ADA)" : ""}`;
}
function coinAnswer(c) {
  const w = h24(c);
  const bits = [`<strong>${esc(tk(c))}</strong>${c.name ? " (" + esc(c.name) + ")" : ""}, last 24 hours:`];
  const list = [];
  var chg = w.ch != null ? w.ch : c.sol && c.sol.ch != null ? c.sol.ch : null;
  list.push(`Price ${esc(price(c.price))} ADA${chg != null ? ", " + esc(pct(chg)) : ""}`);
  if (w.n) list.push(`${fmt(w.v)} ADA traded in ${fmt(w.n)} trades by ${fmt(w.wal)} wallets`);
  else if (c.sol) list.push(solLine(c.sol) + (c.sol.url ? " · " + a(c.sol.url, "DexScreener", true) : ""));
  else if (noAda(c)) list.push(esc(noAda(c)));
  list.push(w.n ? `Net flow ${esc(signed(w.net))} ADA (${w.net > 0 ? "more bought than sold" : w.net < 0 ? "more sold than bought" : "buys and sells even"})` : c.sol ? "No ADA trades on the Cardano side; the Solana trades above are counted by DexScreener, not Gator Eyes" : noAda(c) ? null : "No ADA trades seen in the last 24 hours (Gator Eyes only counts trades in ADA)");
  if (c.mc) list.push(`Market cap about ${compact(c.mc)} ADA${c.hold ? ", " + fmt(c.hold) + " holders" : ""}`);
  if (c.cs === "open" && c.prog != null) {
    const p = c.pace || {};
    list.push(`${(c.prog / 100).toFixed(1)}% of the way to graduating, ${fmt(p.need)} ADA to go${p.etaH != null ? ", " + esc(hours(p.etaH)) + " at the last 6 hours' pace" : ", not moving closer right now"}`);
  } else if (c.cs === "graduated") list.push(`Graduated to Minswap${c.gAt && c.born ? " after " + esc(span(c.gAt - c.born)) : ""}`);
  const al = Object.entries(c.al || {}).map(([k, n]) => `${n} ${{ big: "whale", spike: "volume spike", launch: "fast launch", dev: "creator sell" }[k] || k}`);
  list.push(al.length ? `Alerts today: ${al.join(", ")}` : "No Gator Eyes alerts in the last 24 hours");
  bits.push("<ul>" + list.filter(Boolean).map((x) => `<li>${x}</li>`).join("") + "</ul>");
  bits.push(`${a(coinUrl(c.id), "Open on " + lpName(c), true)} · ${page("coincard.html?coin=" + encodeURIComponent(c.id), "Share card")} · ${page("followup.html?coin=" + encodeURIComponent(c.tk || c.id), "Alert follow-up")} · ${page("holders.html?coin=" + encodeURIComponent(c.tk || c.id), "Holders")} · ${page("trades.html?coin=" + encodeURIComponent(c.tk || c.id), "Trade history")}`);
  bits.push(`<small>Just the numbers, not advice.</small>`);
  return bits.join("");
}

function walletAnswer(c) {
  const w = h24(c), h1 = (c.w && c.w.h1) || {};
  const list = [];
  if (w.n) {
    list.push(`${fmt(w.wal)} different wallets made ${fmt(w.n)} trades`);
    list.push(`Bought ${fmt(w.b)} ADA, sold ${fmt(w.s)} ADA: net ${esc(signed(w.net))} ADA (${w.net > 0 ? "more bought than sold" : w.net < 0 ? "more sold than bought" : "buys and sells even"})`);
    if (h1.n) list.push(`Last hour: ${fmt(h1.wal)} wallets, ${fmt(h1.n)} trades, net ${esc(signed(h1.net))} ADA`);
  } else if (c.sol) list.push(solLine(c.sol) + ". DexScreener doesn't say how many wallets");
  else list.push(noAda(c) ? esc(noAda(c)) : "No ADA trades in the last 24 hours");
  if (c.hold) list.push(`${fmt(c.hold)} wallets hold it right now`);
  const al = c.al || {};
  list.push(al.dev ? `${fmt(al.dev)} creator sell${al.dev > 1 ? "s" : ""} flagged today` : "No creator sells flagged today");
  if (al.big) list.push(`${fmt(al.big)} whale trade${al.big > 1 ? "s" : ""} flagged today`);
  return `<strong>${esc(tk(c))}</strong> wallets, last 24 hours:<ul>${list.map((x) => `<li>${x}</li>`).join("")}</ul>To see where the supply sits (creator, pool, biggest wallets): ${page("holders.html?coin=" + encodeURIComponent(c.tk || c.id), "Open " + tk(c) + " holders")}. Gator Eyes doesn't rate coins. For a safety check, ${a("https://suriradar.fun/", "Suri Radar", true)} is built for that.<br><small>Just the numbers, not advice.</small>`;
}

// "make a share card for $X", "holders of $X", "follow-up for $X": link straight to that tool for the coin.
const COIN_TOOLS = [
  { re: /\b(share card|coin card|card for|card of|image|picture|pic|graphic|png)\b/, run: (c) => `Here's the share card for <strong>${esc(tk(c))}</strong>: ${page("coincard.html?coin=" + encodeURIComponent(c.id), "Open the " + tk(c) + " share card")}. Tap Download PNG (or Save image on a phone) and Copy caption, then post it.${hasTrades(c) ? "" : c.sol ? " The card shows its Solana trades. " + solLine(c.sol) + "." : noAda(c) ? " Its trades happen on the Solana side, so the card may show 0 ADA traded." : " No ADA trades in the last 24 hours, so the card will show 0."}` },
  { re: /\b(wallets?|whales?|buyers?|sellers?|bundl\w*|insiders?|who(?:'s| is) (?:buying|selling))\b/, run: walletAnswer },
  { re: /\b(trade history|trade log|trade list|all (?:the )?trades|every trade|list of trades|recent trades|transactions?|txs?)\b/, run: (c) => `Here's every <strong>${esc(tk(c))}</strong> trade on its launchpad, newest first: ${page("trades.html?coin=" + encodeURIComponent(c.tk || c.id), "Open " + tk(c) + " trade history")}. Filter by buys or sells, size or one wallet, then download the CSV.` },
  { re: /\b(holders?|holder list|snapshot|airdrop)\b/, run: (c) => `Here's the holder snapshot for <strong>${esc(tk(c))}</strong>: ${page("holders.html?coin=" + encodeURIComponent(c.tk || c.id), "Open " + tk(c) + " holders")}.${c.hold ? " It has about " + fmt(c.hold) + " holders right now." : ""} Set your rules there, then download the CSV.` },
  { re: /\b(follow[- ]?up|track record|after the alert|alert history)\b/, run: (c) => `Here's the alert follow-up for <strong>${esc(tk(c))}</strong>: ${page("followup.html?coin=" + encodeURIComponent(c.tk || c.id), "Open " + tk(c) + " follow-up")}. It shows what the price did 1 hour and 24 hours after each alert.` },
];
function top(list, n, line) {
  return "<ol>" + list.slice(0, n).map((c) => `<li>${line(c)}</li>`).join("") + "</ol>";
}
const coinLink = (c) => `<strong>${a(coinUrl(c.id), tk(c), true)}</strong>${String(c.id || "").startsWith("snek:") ? " <small>(Snek.fun)</small>" : ""}`;
const lpName = (c) => String((c && c.id) || "").startsWith("snek:") ? "Snek.fun" : "Solada.fun";

// "5 newest", "top 3", "ten newest": how many items the person asked for.
const NUMS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
function countIn(q, dflt) {
  const m = (q || "").match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  const n = m ? NUMS[m[1]] || parseInt(m[1], 10) : dflt;
  return Math.max(1, Math.min(10, n || dflt));
}
// Asking for a list of coins rather than one coin.
const LIST_RE = /\b(tokens|coins|launches|projects|newest|latest|recent|top \d+|top (three|five|ten)|which|list|ranking|rank|\d+ (new|top|best|most|biggest))\b/;
// "on solada", "solada.fun", "how is solada": the platform, not the $SOLADA coin.
const PLATFORM_RE = /\b(on|in|across|at|from|of|for) solada\b|solada\.fun|\bsolada (today|market|launchpad|platform|overall|right now)\b|\bhow('s| is) solada\b/;

const LIVE = [
  {
    keys: ["graduat", "close to", "closest", "race", "bonding", "curve", "eta", "almost"],
    not: ["what is graduat", "what's graduat", "what does graduat", "how does graduat", "graduation mean", "graduate mean", "bonding curve", "what is a bonding", "what's a bonding"],
    run: async () => {
      const d = await tokens();
      const open = d.coins.filter((c) => c.cs === "open" && c.prog != null).sort((x, y) => y.prog - x.prog);
      if (!open.length) return "Nothing is on the bonding curve right now.";
      return `Closest to graduating right now:${top(open, 5, (c) => `${coinLink(c)} ${(c.prog / 100).toFixed(1)}%${c.pace && c.pace.etaH != null ? ", " + esc(hours(c.pace.etaH)) + " to go" : ", not moving closer"}`)}Full list with pace on the ${page("race.html", "Race page")}.`;
    },
  },
  {
    keys: ["most traded", "top volume", "highest volume", "busiest", "hot", "trending", "popular", "top coins", "biggest coins", "most volume"],
    not: ["market cap", "marketcap", "mcap"],
    run: async () => {
      const d = await tokens();
      const l = [...d.coins].sort((x, y) => h24(y).v - h24(x).v);
      return `Most traded in the last 24 hours:${top(l, 5, (c) => `${coinLink(c)} ${fmt(h24(c).v)} ADA, net ${esc(signed(h24(c).net))}`)}Sort it any way you like on the ${page("tokens.html", "Tokens page")}.`;
    },
  },
  {
    keys: ["inflow", "highest inflow", "biggest inflow", "most inflow", "top inflow", "inflow volume", "money in", "money going", "being bought", "most bought", "buying most", "net buy", "accumulat"],
    run: async () => {
      const d = await tokens();
      const l = d.coins.filter((c) => h24(c).net > 0).sort((x, y) => h24(y).net - h24(x).net);
      if (!l.length) return "No coin has more buying than selling in the last 24 hours.";
      return `Biggest net buying in the last 24 hours:${top(l, 5, (c) => `${coinLink(c)} ${esc(signed(h24(c).net))} ADA`)}Hour-by-hour detail is on the ${page("flows.html", "Flows page")}.`;
    },
  },
  {
    keys: ["outflow", "highest outflow", "biggest outflow", "most outflow", "top outflow", "money out", "being sold", "most sold", "selling most", "dump"],
    run: async () => {
      const d = await tokens();
      const l = d.coins.filter((c) => h24(c).net < 0).sort((x, y) => h24(x).net - h24(y).net);
      if (!l.length) return "No coin has more selling than buying in the last 24 hours.";
      return `Biggest net selling in the last 24 hours:${top(l, 5, (c) => `${coinLink(c)} ${esc(signed(h24(c).net))} ADA`)}`;
    },
  },
  {
    keys: ["market cap", "marketcap", "mcap", "biggest by", "largest coin", "largest token", "top 10", "top ten", "most valuable"],
    run: async () => {
      const d = await tokens();
      const l = d.coins.filter((c) => c.mc && c.kind !== "solada").sort((x, y) => y.mc - x.mc);
      if (!l.length) return "I don't have market caps right now. Give it a minute and ask again.";
      return `Biggest by market cap right now:${top(l, 10, (c) => `${coinLink(c)} ${compact(c.mc)} ADA${c.hold ? ", " + fmt(c.hold) + " holders" : ""}`)}I only know today's numbers, not how long anyone has been up there. Sort by market cap on the ${page("tokens.html", "Tokens page")}.`;
    },
  },
  {
    keys: ["new coin", "newest", "just launched", "new launch", "latest coin", "latest token", "latest launch", "recent launch", "recently launched", "new token", "newly launched", "launched today"],
    run: async (q) => {
      const d = await tokens();
      const n = countIn(q, 5);
      const all = d.coins.filter((c) => c.born && c.kind !== "solada").sort((x, y) => y.born - x.born);
      if (!all.length) return "I don't have launch times right now. Give it a minute and ask again.";
      const recent = all.filter((c) => Date.now() - c.born < 2 * 864e5);
      const l = recent.length >= n ? recent : all;
      const head = l === recent ? `The ${l.length === 1 ? "newest coin" : Math.min(n, l.length) + " newest coins"} that have traded:` : `Not many new coins in the last two days, so here are the ${Math.min(n, l.length)} newest that have traded:`;
      return `${head}${top(l, n, (c) => `${coinLink(c)}${c.name && c.name !== c.tk ? " (" + esc(c.name) + ")" : ""} launched ${esc(span(Date.now() - c.born))} ago, ${fmt(h24(c).v)} ADA traded in 24h`)}Sort by age on the ${page("tokens.html", "Tokens page")}. Fast starters get posted in #fast-launch on ${discord()}.`;
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
    keys: ["solada today", "volume today", "how is solada", "how's solada", "launchpads doing", "launchpads today", "how are the launchpads", "snek today", "how is snek", "how's snek", "market today", "total volume", "overall"],
    not: ["inflow", "outflow", "which", "what coin", "what token", "who had", "most traded", "highest volume", "most volume"],
    run: async () => {
      const d = await tokens();
      const by = { "Solada.fun": { v: 0, n: 0, net: 0 }, "Snek.fun": { v: 0, n: 0, net: 0 } };
      for (const c of d.coins) { const w = h24(c), b = by[lpName(c)]; b.v += w.v; b.n += w.n; b.net += w.net; }
      const v = by["Solada.fun"].v + by["Snek.fun"].v, n = by["Solada.fun"].n + by["Snek.fun"].n, net = by["Solada.fun"].net + by["Snek.fun"].net;
      const rows = Object.keys(by).filter((k) => by[k].n).map((k) => `<li>${k}: ${fmt(by[k].v)} ADA, ${fmt(by[k].n)} trades, net flow ${esc(signed(by[k].net))} ADA</li>`).join("");
      return `In the last 24 hours across Solada.fun and Snek.fun: <strong>${fmt(v)} ADA</strong> traded${d.adaUsd ? ` (~${fmt(v * d.adaUsd)} USDCx)` : ""} across ${fmt(n)} trades. Net flow ${esc(signed(net))} ADA.${rows ? `<ul>${rows}</ul>` : ""} Today's full picture is on the ${page("flows.html", "Flows page")}.`;
    },
  },
];

// ---------- built-in answers ----------
// Questions about Quagmire himself ("do you like this picture of you?"), not about a tool.
const ABOUT_ME = [" of you ", " of you?", "you like", "like you", "of yourself", "your picture", "your pic", "your face", "your look", "you look", "pic of you", "photo of you", "your avatar", "your art"];
const FAQ = [
  { keys: ["what is gator eyes", "what's gator eyes", "what does gator eyes", "about gator eyes", "who are you", "what are you", "what is this site", "what is this"], a: () => `I'm Quagmire, resident data nerd at Gator Eyes. Gator Eyes is a free, automated tracker for Cardano launchpads, starting with Solada.fun and Snek.fun. It reads every public trade on Solada.fun and Snek.fun every minute, adds up where the money moves, and posts what stands out to ${discord()} and X. No sign-up, no wallet connection.` },
  { keys: ["alerts mean", "types of alert", "what alerts", "alert types", "kinds of alert", "what triggers", "alert rules"], a: () => `Four kinds of alert:<ul><li><strong>Whale trade</strong>: a trade worth $1,000 or more in ADA, or one worth at least 7.5% of the coin's market cap (minimum 250 ADA).</li><li><strong>Volume spike</strong>: a coin trading 4 times its normal pace over 15 minutes, with at least 1,500 ADA moving.</li><li><strong>Fast launch</strong>: a new coin pulling in 1,000 ADA from 8 or more wallets in its first hour.</li><li><strong>Creator sell</strong>: the wallet that created a coin selling 500 ADA or more, or at least 5% of the coin's market cap. Posted as a record, not a warning.</li></ul>More on the ${page("about.html", "How it works page")}.` },
  { keys: ["whale"], a: () => `A whale alert is any single trade worth $1,000 or more in ADA (the ADA amount moves with the price), or a trade worth at least 7.5% of the coin's market cap (minimum 250 ADA). They post in #whale-alerts on ${discord()}.` },
  { keys: ["spike"], a: () => "A volume spike means a coin traded at 4 times its normal pace over 15 minutes, with at least 1,500 ADA moving. Each coin can spike at most once an hour so the channel doesn't flood." },
  { keys: ["fast launch"], a: () => `A fast launch is a new coin that pulls in 1,000 ADA from 8 or more different wallets in its first hour. They post in #fast-launch on ${discord()}.` },
  { keys: ["creator sell", "dev sell", "creator wallet", "dev wallet", "rug"], a: () => `A creator sell is the wallet that made a coin selling 500 ADA or more, or at least 5% of the coin's market cap. It's posted for transparency, not as a warning. Creators sell for lots of reasons. Gator Eyes doesn't rate coins or call rugs. For a safety check, a tool like ${a("https://suriradar.fun/", "Suri Radar", true)} is built for that.` },
  { keys: ["gator tracks", "daily recap", "recap"], a: () => `Gator Tracks is the daily recap: one post with volume, most traded coins and where the money went, split by launchpad (Solada.fun and Snek.fun) with a combined total, for the previous day midnight to midnight Eastern. It posts at 12:01 AM Eastern, right after the day closes, in #gator-tracks and on ${a(CONFIG.x, "X", true)}. Make your own day image with the ${page("card.html", "daily flow card")}.` },
  { keys: ["pulse", "every 4 hours", "x posts", "twitter"], a: () => `On ${a(CONFIG.x, "X (@GatorEyesADA)", true)} Gator Eyes posts a Launchpad Pulse every 4 hours (4 AM, 8 AM, 12 PM, 4 PM and 8 PM Eastern; midnight is covered by Gator Tracks): volume, most traded, biggest inflow, spikes, fast starts, new coins and the biggest trade. Instant alerts stay on Discord.` },
  { keys: ["discord", "channel", "join", "community"], a: () => `${discord("Join the Discord")} for instant alerts. Channels: #whale-alerts (big trades and volume spikes), #fast-launch, #creator-sells, #gator-tracks (daily recap) and #gaey-trades. #alerts-overview explains them all.` },
  { keys: ["net flow", "netflow", "inflow mean"], a: () => "Net flow is ADA bought minus ADA sold. +500 means buyers put in 500 ADA more than sellers took out. It shows direction, not price, and big trades can swing it." },
  { keys: ["what is graduat", "what does graduat", "graduation mean", "what is a bonding", "what's a bonding", "bonding curve", "how does graduat", "graduate mean"], a: () => `New Solada.fun coins start on a bonding curve, where price rises as people buy. When enough ADA is in the curve (about 10,344 ADA), the coin graduates and moves to a Minswap pool. The ${page("race.html", "Race page")} shows who's closest.` },
  { keys: ["eta", "pace", "to go"], a: () => "The ETA on the Race page takes the last 6 hours of net buying on the curve and asks how long it would take to fill the rest at that pace. It changes fast and isn't a prediction. \"Not moving closer\" means more was sold than bought in that time." },
  { keys: ["follow-up", "follow up", "followup", "track record", "accurate", "do alerts work", "after an alert"], a: () => `The ${page("followup.html", "Follow-up page")} shows every alert and what the coin's price did 1 hour and 24 hours later. Good and bad, nothing hidden. It's there so you can judge the alerts yourself.` },
  { keys: ["trade history", "trade log", "all trades", "every trade", "list of trades", "see the trades", "see trades", "transactions"], a: () => `The ${page("trades.html", "Trade history")} page lists every buy and sell for one coin on Solada.fun or Snek.fun, newest first, with the ADA, tokens, price paid and wallet. Filter by side, size or a single wallet, load the full history and download the CSV.` },
  { keys: ["holder", "airdrop", "snapshot", "csv"], a: () => `Use the ${page("holders.html", "Holder snapshot")}: type a ticker and it shows where the supply sits, split into the bonding curve, liquidity pool, locked tokens, the creator, other contracts and ordinary wallets. Each group is labelled in the list and can be put in or left out with a click. Add a minimum balance, top-N or a "hasn't sold since" date, then download the CSV.` },
  { keys: ["share card", "coin card", "image of a coin", "image of $", "image for", "picture of a coin", "picture of $", "picture for", "make an image", "make a picture", "make a graphic", "coin image", "coin picture", "coin graphic", "post an image", "png"], not: ABOUT_ME, a: () => `The ${page("coincard.html", "Coin share card")} makes a ready-to-post image of any coin's last 24 hours. Pick a coin, then tap Download PNG (or Save image on a phone) and Copy caption. For the whole market, use the ${page("card.html", "daily flow card")}.` },
  { keys: ["tokens page", "tokens table", "table", "all coins", "list of coins"], a: () => `The ${page("tokens.html", "Tokens page")} lists every coin Gator Eyes tracks on Solada.fun and Snek.fun with price, change, volume, trades, net flow, market cap, curve progress and alerts. Switch between Live (15 min), 1h, 6h and 24h, and click a column to sort.` },
  { keys: ["flows", "by hour", "venue"], a: () => `The ${page("flows.html", "Flows page")} shows where the ADA went today: money in and out by coin, by hour and by venue (Solada curve, Minswap, Splash, Pump.fun, the Snek.fun curve and Splash pools). Days run midnight to midnight Eastern.` },
  { keys: ["widget", "embed", "my site", "my website"], a: () => `Run a project? Put a live box with your coin's volume, net flow and latest alerts on your own site. The embed code is on the ${page("about.html#embed", "How it works page")}.` },
  { keys: ["api", "json", "feed url", "data for", "builder", "developer"], a: () => `Gator Eyes' data feed only powers this site. To show live Solada numbers on your own site, use the embed widget on the ${page("about.html#embed", "How it works page")}.` },
  { keys: ["gaey", "your token", "team token"], a: () => `$GAEY is the Gator Eyes team's own token. It trades on Solada.fun until it bonds, not on Snek.fun. Holder rewards are paid in ADA, and the creator locked 4.94M GAEY until Nov 26. Every trade posts in #gaey-trades. See the ${page("gaey.html", "$GAEY page")}.` },
  { keys: ["referral", "6pxznt5n", "ref code"], a: () => "Solada.fun links from Gator Eyes include our referral code, 6pxznt5n. It may earn the team referral rewards and costs you nothing extra." },
  { keys: ["usdcx", "usd", "dollar"], a: () => "The ~USDCx figures are approximate. They use the latest ADA to USDCx rate Gator Eyes saw, so treat them as a rough guide." },
  { keys: ["how often", "update", "refresh", "delay", "real time", "realtime", "live"], a: () => "Gator Eyes checks Solada.fun and Snek.fun every minute. Alerts usually land within a minute or two of the trade. If either site starts refusing requests, Gator Eyes automatically slows down for a bit and catches up. If Solada is down or updating, alerts pause and the site says so at the top." },
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

function socialsAnswer(c) {
  const L = c.links || {};
  const names = { twitter: "X", website: "Website", telegram: "Telegram", discord: "Discord" };
  const items = ["twitter", "website", "telegram", "discord"].filter((k) => L[k]).map((k) => `<li>${names[k]}: ${a(L[k], L[k].replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), true)}</li>`);
  const head = `<strong>${a(coinUrl(c.id), tk(c), true)}</strong>${c.name && c.name !== c.tk ? " (" + esc(c.name) + ")" : ""}`;
  if (!items.length) return `${head} has no socials listed on Solada.fun. That's what the creator filled in, so nothing is hiding. ${a(coinUrl(c.id), "Check the coin page", true)} in case they add some.`;
  return `${head} socials from Solada.fun:<ul>${items.join("")}</ul>These are whatever the creator listed. Make sure they're real before trusting them.`;
}
var SOCIAL_RE = /\b(social|socials|twitter|x account|x page|x link|x profile|website|web site|telegram|discord link|discord server)\b/;
async function findCoin(q) {
  const d = await tokens().catch(() => null);
  if (!d) return null;
  const words = new Set(q.toUpperCase().match(/\$?[A-Z0-9]{2,12}/g)?.map((w) => w.replace("$", "")) || []);
  const skip = new Set(["THE", "IS", "IT", "ON", "TO", "OF", "AND", "HOW", "WHAT", "ADA", "ETA", "CSV", "API", "USD", "NET", "TOP", "NEW", "DEV", "BUY", "SELL", "SHOW", "FOR", "ME", "MY", "DO", "YOU", "ARE", "CAN", "TODAY", "COIN", "COINS", "X", "SITE", "DOING", "ABOUT", "TELL", "GATOR", "EYES"]);
  // "Solada" on its own usually means the launchpad. Only treat it as the $SOLADA coin
  // when written with a $ or when the question isn't about the platform or a list of coins.
  const lq = norm(q);
  if (!/\$solada\b/i.test(q) && (PLATFORM_RE.test(lq) || LIST_RE.test(lq))) skip.add("SOLADA");
  const hits = d.coins.filter((c) => c.tk && words.has(c.tk.toUpperCase()) && (!skip.has(c.tk.toUpperCase()) || q.includes("$" + c.tk)));
  if (!hits.length) return null;
  // Same ticker on more than one coin: take the busier one.
  return hits.sort((x, y) => h24(y).v - h24(x).v)[0];
}

// When the question isn't clear, say so and show what I can answer instead of guessing.
const CAN_DO = ["5 newest coins", "Most traded today", "What's close to graduating?", "Biggest inflow today", "Top 10 by market cap", "How are the launchpads doing today?"];
function notSure(coin) {
  const opts = "<ul>" + CAN_DO.map((x) => `<li><em>${esc(x)}</em></li>`).join("") + "</ul>";
  if (coin) return `I'm not sure what you're after. If you want ${esc(tk(coin))}'s numbers, ask <em>${esc(tk(coin))}</em> on its own. If you want a list, I can do:${opts}`;
  return `Hmm, that's not in my notes yet. I can answer things like:${opts}Or try a coin ticker like $MEPE, or ask about the alerts, net flow, holder snapshots or share cards. For anything else, ask in ${discord()}.`;
}

async function answer(raw) {
  const q = norm(raw);
  if (/^ ?(hi|hey|hello|yo|sup|gm|howdy)\b/.test(q.trim()) && q.trim().split(" ").length <= 3) return "Oh, hi. <em>pushes up glasses</em> Ask me about the alerts, a coin by its ticker, what's close to graduating, or how to use the tools. I have data on all of it.";
  if (/\b(thanks|thank you|thx|ty)\b/.test(q)) return "Happy to help. I'll be here, recalculating.";
  const advice = ADVICE.some((k) => q.includes(k));
  let coin = await findCoin(raw);
  if (SOCIAL_RE.test(q) && !/\b(gator eyes|your|you)\b/.test(q)) {
    if (coin) return socialsAnswer(coin);
    if (!/\b(alert|graduat|net flow|holder|card|follow|embed|widget)\b/.test(q)) return `Which coin? Ask like <em>socials $MEPE</em> and I'll list what the creator put on Solada.fun.`;
  }
  if (coin && !hasTrades(coin) && coin.kind === "pump") {
    var td = await tokens().catch(() => null);
    coin = { ...coin, sol: await solSide(coin, td && td.adaUsd) };
  }
  if (coin && !advice) { for (const t of COIN_TOOLS) if (t.re.test(q)) return t.run(coin); }
  if (advice) return `I just crunch the numbers, I can't tell you what to buy or sell. Gator Eyes reports what traded, not what to do next.${coin ? " Here's what " + esc(tk(coin)) + " has been doing:<br><br>" + coinAnswer(coin) : ""}`;
  const score = (keys, not = []) => (not.some((k) => q.includes(k)) ? 0 : keys.reduce((s, k) => s + (q.includes(k) ? k.length : 0), 0));
  let best = null, bestS = 0, live = null, liveS = 0;
  for (const it of LIVE) { const s = score(it.keys, it.not); if (s > liveS) { live = it; liveS = s; } }
  best = live; bestS = liveS;
  for (const it of FAQ) { const s = score(it.keys, it.not); if (s > bestS) { best = it; bestS = s; } }
  const listAsk = LIST_RE.test(q);
  const run = async (it) => {
    try { return it.run ? await it.run(q) : it.a(); }
    catch { return "My data feed isn't answering right now. Give it a minute and ask again."; }
  };
  // A list question ("5 newest tokens", "top coins") beats a ticker that happens to be in it.
  if (live && listAsk && (coin || best === live)) return run(live);
  if (coin && (!/\b(what is|what's|how do|how does)\b/.test(q) || q.includes("$" + coin.tk.toLowerCase()) || new RegExp("\\b(of|for|about|on|with) \\$?" + coin.tk.toLowerCase() + "\\b").test(q))) {
    // Looks like a list question we don't have an answer for: ask instead of guessing.
    if (listAsk && !q.includes("$" + coin.tk.toLowerCase())) return notSure(coin);
    return coinAnswer(coin);
  }
  if (coin && !best) return listAsk ? notSure(coin) : coinAnswer(coin);
  if (best) return run(best);
  return notSure(null);
}

// ---------- widget ----------
const SUGGEST = ["What do the alerts mean?", "What's close to graduating?", "Most traded today", "How do I make a holder list?", "What is net flow?"];
const KEY = "gator-chat-v1";

// Save the question and a plain-text copy of the answer for the daily review (no names or wallets).
function logQuestion(q, html) {
  try {
    const a = String(html).replace(/<li>/g, " - ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);
    const fb = /not in my notes yet/.test(html);
    fetch(API + "/qlog", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ q, a, fb, pg: location.pathname }), keepalive: true }).catch(() => {});
  } catch {}
}

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
    add("me", q);
    chips.hidden = true;
    const wait = add("gator", '<span class="gator-dots"><i></i><i></i><i></i></span>', false);
    let html;
    try { html = await answer(q); } catch { html = "Something went wrong on my end. Try again in a minute."; }
    wait.remove();
    add("gator", html);
    logQuestion(q, html);
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

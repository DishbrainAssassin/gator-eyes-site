// How it works page. Alert rules are read from the live feed so this page
// always matches what the bot is actually doing.
import { subscribe, RULES_DEFAULT } from "./data.js?v=20261101-tape2";
import { wireLinks, liveStatus } from "./common.js?v=20261101-tape2";
import { esc, fmt } from "./ui.js?v=20261101-tape2";

wireLinks();

const $ = (s) => document.querySelector(s);
const hour = (h, m = 0) => { const hh = h % 12 === 0 ? 12 : h % 12; return hh + (m ? ":" + String(m).padStart(2, "0") : "") + (h < 12 ? " AM" : " PM"); };

function renderRules(r) {
  const rows = [
    ["k-whale", "Whale trade", `Any single trade worth $${fmt(r.bigUsd || 1000)} or more in ADA (about ${fmt(r.bigAda)} ADA at today's price), or a trade worth at least ${fmt(r.mcapPct, 2)}% of a coin's market cap (minimum ${fmt(r.mcapMinAda)} ADA). The market-cap rule excludes Snek.fun Splash trades.`, "#whale-alerts"],
    ["k-spike", "Volume spike", `At least ${fmt(r.spikeMinAda)} ADA traded in ${fmt(r.spikeWindowMin)} minutes, at ${fmt(r.spikeMult)} times or more the coin's normal pace, from two or more wallets. One per coin per hour.`, "#whale-alerts"],
    ["k-dev", "Creator sell", `The wallet that created a coin sells ${fmt(r.creatorMinAda || 500)} ADA or more, or at least ${fmt(r.creatorMcapPct || 5, 2)}% of the coin's market cap (minimum ${fmt(r.mcapMinAda || 250)} ADA). The market-cap rule excludes Snek.fun Splash trades. Posted for transparency. Creators sell for lots of reasons.`, "#creator-sells"],
    ["k-launch", "Fast launch", `A new coin pulls in ${fmt(r.launchMinAda)} ADA of buys from ${fmt(r.launchMinBuyers)} or more wallets within its first ${fmt(r.launchWindowMin)} minutes.`, "#fast-launch"],
    ["k-whale", "Snek.fun whale trade", `Any single Snek.fun trade worth $${fmt((r.snek && r.snek.bigUsd) || r.bigUsd || 1000)} or more in ADA (about ${fmt((r.snek && r.snek.bigAda) || r.bigAda)} ADA at today's price). On the Snek.fun curve, a trade also qualifies at ${fmt(r.mcapPct, 2)}% of market cap or more (minimum ${fmt(r.mcapMinAda || 250)} ADA). The market-cap rule does not apply to Splash trades. Snek.fun alerts post to their own channel.`, "#snek-alerts"],
    ["k-tracks", "Gator Tracks", `The day's recap at ${hour(r.recapHourET, r.recapMinET)} Eastern, right after midnight: volume, net flow, busiest hour, top venue, most traded coins, and where the money went. One post covers every launchpad, split by launchpad with a combined total.`, "#gator-tracks"],
    ["k-gaey", "$GAEY trades", "Every buy and sell of $GAEY, the team's own token, in its own channel so it never crowds the others.", "#gaey-trades"],
  ];
  $("[data-rules]").innerHTML = rows
    .map(([cls, name, text, ch]) => `<div class="rule ${cls}"><div class="rule-k"><span class="watch-k">${esc(name)}</span><span class="rule-ch mono">${esc(ch)}</span></div><p>${esc(text)}</p></div>`)
    .join("");
}

// Embed code
const embedBase = new URL("./embed.html", location.href);
embedBase.search = "";
const coinInput = $("[data-embed-coin]");
const frame = $("[data-embed-frame]");
function embedSrc() {
  const id = coinInput.value.trim().replace(/^.*\/coin\//, "").replace(/[?#].*$/, "");
  const u = new URL(embedBase);
  if (id) u.searchParams.set("coin", id);
  return u.toString();
}
function renderEmbed() {
  const src = embedSrc();
  $("[data-embed-code]").textContent = `<iframe src="${src}" width="360" height="340" style="border:0;border-radius:12px" title="Gator Eyes live flows" loading="lazy"></iframe>`;
  if (frame.src !== src) frame.src = src;
}
let t;
coinInput.addEventListener("input", () => {
  clearTimeout(t);
  t = setTimeout(renderEmbed, 400);
});
renderEmbed();

document.querySelectorAll("[data-copy]").forEach((b) =>
  b.addEventListener("click", async () => {
    const text = $("[data-embed-code]").textContent;
    try {
      await navigator.clipboard.writeText(text);
      b.textContent = "Copied";
    } catch {
      b.textContent = "Select and copy";
    }
    setTimeout(() => (b.textContent = "Copy"), 1600);
  })
);

renderRules(RULES_DEFAULT);
subscribe((f, err) => {
  liveStatus(f, err);
  if (f) renderRules(f.rules);
});

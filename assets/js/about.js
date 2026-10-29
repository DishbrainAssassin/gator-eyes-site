// How it works page. Alert rules are read from the live feed so this page
// always matches what the bot is actually doing.
import { subscribe, RULES_DEFAULT } from "./data.js?v=20261029h";
import { CONFIG } from "./config.js?v=20261029h";
import { wireLinks, liveStatus } from "./common.js?v=20261029h";
import { esc, fmt } from "./ui.js?v=20261029h";

wireLinks();

const $ = (s) => document.querySelector(s);
const hour = (h) => (h === 0 ? "12 AM" : h < 12 ? h + " AM" : h === 12 ? "12 PM" : h - 12 + " PM");

function renderRules(r) {
  const rows = [
    ["k-whale", "Whale trade", `Any single trade of ${fmt(r.bigAda)} ADA or more, or a trade worth at least ${fmt(r.mcapPct)}% of a coin's market cap (minimum ${fmt(r.mcapMinAda)} ADA).`, "#whale-alerts"],
    ["k-spike", "Volume spike", `At least ${fmt(r.spikeMinAda)} ADA traded in ${fmt(r.spikeWindowMin)} minutes, at ${fmt(r.spikeMult)} times or more the coin's normal pace, from two or more wallets. One per coin per hour.`, "#whale-alerts"],
    ["k-dev", "Creator sell", `The wallet that created a coin sells ${fmt(r.creatorMinAda)} ADA or more. Posted for transparency. Creators sell for lots of reasons.`, "#creator-sells"],
    ["k-launch", "Fast launch", `A new coin pulls in ${fmt(r.launchMinAda)} ADA of buys from ${fmt(r.launchMinBuyers)} or more wallets within its first ${fmt(r.launchWindowMin)} minutes.`, "#fast-launch"],
    ["k-tracks", "Gator Tracks", `Yesterday's recap at ${hour(r.recapHourET)} Eastern: volume, net flow, busiest hour, top venue, most traded coins, and where the money went.`, "#gator-tracks"],
    ["k-gaey", "$GAEY trades", "Every buy and sell of $GAEY, the team's own token, in its own channel so it never crowds the others.", "#gaey-trades"],
  ];
  $("[data-rules]").innerHTML = rows
    .map(([cls, name, text, ch]) => `<div class="rule ${cls}"><div class="rule-k"><span class="watch-k">${esc(name)}</span><span class="rule-ch mono">${esc(ch)}</span></div><p>${esc(text)}</p></div>`)
    .join("");
}

// Feed URL + embed code
const feedUrl = CONFIG.feedUrl;
$("[data-feed-url]").textContent = feedUrl;

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
    const text = b.dataset.copy === "feed" ? feedUrl : $("[data-embed-code]").textContent;
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

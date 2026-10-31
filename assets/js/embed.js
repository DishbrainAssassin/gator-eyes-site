// Embeddable live-flows box. Use ?coin=<Solada coin id> for one coin, or leave it
// off for all of Solada. Add &theme=light for light backgrounds.
import { subscribe, setFeedParams } from "./data.js?v=20261031z";
import { esc, fmt, compact, timeAgo, KINDS, usdcx, usdcxSigned } from "./ui.js?v=20261031z";

const p = new URLSearchParams(location.search);
const coinId = (p.get("coin") || "").trim();
if (p.get("theme") === "light") document.documentElement.classList.add("light");
setFeedParams({ coin: coinId });

const $ = (s) => document.querySelector(s);
const short = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "k" : fmt(n));
const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + short(Math.abs(n));
const home = new URL("./flows.html", location.href);
$("[data-home]").href = home.toString();

function pick(f) {
  const d = f.today;
  if (!coinId) {
    if (!d) return null;
    return { title: "Solada today", sub: "All coins, midnight to now ET", v: d.volAda, b: d.buyAda, s: d.sellAda, net: d.buyAda - d.sellAda, n: d.trades, img: null };
  }
  const c = f.coin && f.coin.id === coinId ? f.coin : d && (d.coins || []).find((k) => k.id === coinId);
  const tk = (c && c.tk) || coinId.replace(/^draft-/, "").toUpperCase();
  if (!c || !c.n) return { title: `$${tk} today`, sub: "No trades yet today", v: 0, b: 0, s: 0, net: 0, n: 0, img: c && c.img };
  const b = c.b != null ? c.b : Math.max(0, (c.v + c.net) / 2);
  return { title: `$${tk} today`, sub: "On Solada, midnight to now ET", v: c.v, b, s: c.v - b, net: c.net, n: c.n, img: c.img };
}

function render(f, err) {
  if (!f) {
    $("[data-sub]").textContent = err ? "Live feed reconnecting" : "Loading live flows";
    return;
  }
  const fresh = f.updatedAt && Date.now() - f.updatedAt.getTime() < 15 * 60000;
  $("[data-dot]").classList.toggle("live", !!fresh);
  $("[data-updated]").textContent = f.updatedAt ? (fresh ? "Updated " : "Solada paused · ") + timeAgo(f.updatedAt.getTime()) : "";
  const x = pick(f);
  if (!x) return;
  $("[data-title]").textContent = x.title;
  $("[data-sub]").textContent = x.sub;
  $("[data-img]").innerHTML = x.img ? `<img src="${esc(x.img)}" alt="" onerror="this.remove()">` : "";
  $("[data-kpis]").innerHTML = [
    ["Volume", short(x.v) + " ADA", "", x.v ? usdcx(x.v, f.rate) : ""],
    ["Net flow", signed(x.net) + " ADA", x.net > 0 ? "pos" : x.net < 0 ? "neg" : "", x.net ? usdcxSigned(x.net, f.rate) : ""],
    ["Trades", fmt(x.n), "", ""],
  ].map(([l, v, c, u]) => `<div class="w-kpi"><span>${l}</span><b class="${c}">${v}</b>${u ? `<small>${u}</small>` : ""}</div>`).join("");
  const hasSplit = x.v > 0;
  $("[data-split]").hidden = $("[data-legend]").hidden = !hasSplit;
  if (hasSplit) {
    $("[data-split] .b").style.width = (x.b / x.v) * 100 + "%";
    $("[data-legend]").innerHTML = `<span class="pos">Bought ${compact(x.b)}</span><span class="neg">Sold ${compact(x.s)}</span>`;
  }
  const list = f.alerts.filter((a) => a.kind !== "watch" && (!coinId || a.tokenId === coinId)).slice(0, 4);
  $("[data-alerts]").innerHTML = list.length
    ? list.map((a) => `<li><span class="t">${esc((KINDS[a.kind] || {}).label || a.kind)}${a.ticker && !coinId ? " · $" + esc(a.ticker) : ""}${a.ada ? " · " + compact(a.ada) + " ADA" : ""}</span><span class="a">${timeAgo(a.at)}</span></li>`).join("")
    : `<li class="empty">No alerts${coinId ? " for this coin" : ""} in the last few hours.</li>`;
}

subscribe(render);

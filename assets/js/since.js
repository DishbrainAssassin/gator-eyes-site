// "Since you last looked" on the home page: what happened while you were away.
// Worked out in this browser. It remembers when you were last here and a small
// price snapshot per coin (localStorage) so it can show price moves since then.
// Nothing is sent anywhere and there is no sign-up.
import { subscribe } from "./data.js?v=20261101r";
import { getApi } from "./api.js?v=20261101r";
import { fmt, compact, timeAgo, esc, dayLabel } from "./ui.js?v=20261101r";
import * as watchlist from "./watchlist.js?v=20261101r";
import * as platform from "./platform.js?v=20261101r";

const KEY = "ge-last-seen";
const GAP = 30 * 60000;   // away at least this long counts as a new visit
const MIN_MC = 3000;      // ADA market cap floor for price movers (skips dust)

function read() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } }
function write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} }

const KIND = { big: ["whale trade", "whale trades"], spike: ["volume spike", "volume spikes"], dev: ["creator sell", "creator sells"], launch: ["fast launch", "fast launches"], watch: ["$GAEY trade", "$GAEY trades"] };
const plural = (n, k) => `${n} ${KIND[k] ? KIND[k][n === 1 ? 0 : 1] : k}`;
const link = (tk) => `<a href="./tokens.html?q=${encodeURIComponent(tk)}">$${esc(tk)}</a>`;
const pct = (p) => `<span class="${p >= 0 ? "pos" : "neg"}">${p >= 0 ? "+" : "−"}${Math.abs(p * 100).toFixed(Math.abs(p) < 0.1 ? 1 : 0)}%</span>`;
const etDay = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

export function mountSince() {
  const host = document.querySelector("[data-since]");
  if (!host) return;
  const now = Date.now();
  const prev = read();
  let rec;
  if (!prev) rec = { at: now, base: null };
  else if (now - prev.at > GAP) rec = { at: now, base: prev.at, basePrices: prev.prices || null, basePricesAt: prev.pricesAt || null, prices: prev.prices || null, pricesAt: prev.pricesAt || null };
  else rec = { ...prev, at: now };
  write(rec);
  const bump = () => { rec.at = Date.now(); write(rec); };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") bump(); });
  addEventListener("pagehide", bump);

  // Snapshot prices on every visit so the next visit has something to compare with.
  const tokensP = getApi("/tokens").catch(() => null);
  tokensP.then((j) => {
    if (!j || !Array.isArray(j.coins)) return;
    const prices = {};
    for (const c of j.coins) if (c.price > 0) prices[c.id] = c.price;
    rec.prices = prices;
    rec.pricesAt = Date.now();
    write(rec);
  });

  if (!rec.base || rec.hidden === rec.base) return; // first visit, same session, or hidden by the user
  const base = rec.base;
  let feed = null, tokens = null;
  subscribe((f) => { if (f) { feed = f; render(); } });
  tokensP.then((j) => { tokens = j; render(); });

  function render() {
    if (!feed) return;
    const cards = [];
    const alerts = feed.alerts.filter((a) => a.at > base && platform.inScope(a));
    const oldest = feed.alerts.length ? Math.min(...feed.alerts.map((a) => a.at)) : 0;
    const more = oldest > base && feed.alerts.length >= 60; // the feed only keeps the latest alerts
    const by = {};
    for (const a of alerts) by[a.kind] = (by[a.kind] || 0) + 1;
    const parts = ["big", "spike", "dev", "launch", "watch"].filter((k) => by[k]).map((k) => plural(by[k], k));
    cards.push({ k: "Alerts", v: alerts.length ? fmt(alerts.length) + (more ? "+" : "") : "0", s: parts.length ? parts.join(" · ") + ` · <a href="#alerts">see them</a>` : "Quiet while you were gone." });

    const big = alerts.filter((a) => a.kind === "big" && a.ada).sort((a, b) => b.ada - a.ada)[0];
    if (big) cards.push({ k: "Biggest trade", v: fmt(big.ada) + " ADA", s: `${big.side === "sell" ? "Sold" : "Bought"} · ${link(big.ticker)}` });

    if (tokens && Array.isArray(tokens.coins)) {
      const coins = tokens.coins.filter((c) => platform.inScope(c));
      const born = coins.filter((c) => c.born && c.born > base).sort((a, b) => b.born - a.born);
      const grads = coins.filter((c) => c.gAt && c.gAt > base);
      const bornTxt = born.length ? born.slice(0, 4).map((c) => link(c.tk)).join(", ") + (born.length > 4 ? ` and ${born.length - 4} more` : "") : "No new coins.";
      cards.push({ k: "New coins", v: fmt(born.length), s: bornTxt + (grads.length ? ` · ${grads.length} graduated: ${grads.slice(0, 3).map((c) => link(c.tk)).join(", ")}` : "") });

      if (rec.basePrices && Object.keys(rec.basePrices).length) {
        const moves = coins
          .filter((c) => c.price > 0 && rec.basePrices[c.id] > 0 && (c.mc || 0) >= MIN_MC)
          .map((c) => ({ c, p: c.price / rec.basePrices[c.id] - 1 }))
          .filter((m) => Math.abs(m.p) >= 0.01)
          .sort((a, b) => b.p - a.p);
        const up = moves.filter((m) => m.p > 0).slice(0, 3), down = moves.filter((m) => m.p < 0).slice(-3).reverse();
        const lead = [...moves].sort((a, b) => Math.abs(b.p) - Math.abs(a.p))[0];
        const rest = [...up, ...down].filter((m) => m !== lead).map((m) => `${link(m.c.tk)} ${pct(m.p)}`).join(" · ");
        cards.push({ k: "Biggest price move", v: lead ? `${pct(lead.p)}` : "–", s: lead ? `${link(lead.c.tk)}${rest ? " · also " + rest : ""}` : "Nothing moved more than 1%." });
      } else {
        cards.push({ k: "Price moves", v: "–", s: "Starts next visit: prices are being remembered from now on." });
      }

      if (watchlist.count()) {
        const ids = new Set(watchlist.ids());
        const mine = coins.filter((c) => ids.has(c.id));
        const myAlerts = alerts.filter((a) => ids.has(a.tokenId)).length;
        const myMoves = rec.basePrices ? mine.filter((c) => c.price > 0 && rec.basePrices[c.id] > 0).map((c) => ({ c, p: c.price / rec.basePrices[c.id] - 1 })).sort((a, b) => Math.abs(b.p) - Math.abs(a.p)).slice(0, 3) : [];
        const s = [myMoves.length ? myMoves.map((m) => `${link(m.c.tk)} ${pct(m.p)}`).join(" · ") : null, myAlerts ? `${myAlerts} alert${myAlerts === 1 ? "" : "s"} on your coins` : null].filter(Boolean).join(" · ");
        cards.push({ k: "Your watchlist", v: fmt(mine.length) + (mine.length === 1 ? " coin" : " coins"), s: (s || "No alerts on your coins.") + ` · <a href="./watchlist.html">open</a>` });
      }
    }

    const baseKey = etDay(base);
    const fresh = (feed.recaps || []).filter((d) => d.key >= baseKey).sort((a, b) => (a.key < b.key ? 1 : -1))[0];
    if (fresh) {
      const top = fresh.top && fresh.top[0];
      cards.push({ k: "Gator Tracks", v: compact(fresh.volAda) + " ADA", s: `${esc(dayLabel(fresh.key))}: ${fmt(fresh.trades)} trades${top ? ` · top ${link(top.tk)}` : ""} · <a href="./flows.html">open</a>` });
    }

    host.innerHTML = `<div class="wrap"><div class="panel">
      <div class="since-head"><h2>Since you last looked</h2><span class="section-meta">You were here ${esc(timeAgo(base))}${platform.get() !== "all" ? ` · ${esc(platform.label(platform.get()))} only` : ""}</span></div>
      <div class="since-grid">${cards.map((c) => `<div class="since-item"><span class="k">${c.k}</span><span class="v">${c.v}</span><span class="s">${c.s}</span></div>`).join("")}</div>
      <div class="since-foot"><span>Worked out in this browser from your last visit. Nothing is sent anywhere.</span><button type="button" data-since-hide>Hide until next visit</button></div>
    </div></div>`;
    host.hidden = false;
    host.querySelector("[data-since-hide]").addEventListener("click", () => {
      rec.hidden = base;
      write(rec);
      host.hidden = true;
    });
  }
  platform.on(() => render());
}

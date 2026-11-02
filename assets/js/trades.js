// Trade history: every buy and sell for one Solada.fun or Snek.fun coin, newest first, with
// side / size / wallet filters and a CSV download. Pages come from the worker's /coin-trades.
import { getApi, price as fmtPrice } from "./api.js?v=20261102-statcard";
import { coinUrl, fetchFeed } from "./data.js?v=20261102-statcard";
import { esc, fmt, compact } from "./ui.js?v=20261102-statcard";
import { wireLinks, liveStatus } from "./common.js?v=20261102-statcard";
import * as platform from "./platform.js?v=20261102-statcard";
import { pill } from "./platform.js?v=20261102-statcard";

wireLinks();
platform.mount();
platform.on(() => fillList());
const $ = (s) => document.querySelector(s);

// Pages per batch and the hard stop (100 pages ≈ 5,000 Solada trades), matching the holder snapshot.
const BATCH = 6, MAX_PAGES = 100;
const st = { coins: [], coin: null, dec: 6, list: [], seen: new Set(), before: "", more: true, pages: 0, busy: false, run: 0, side: "", min: 0, wallet: "", shown: 200, sol: null, chain: "", adaUsd: null };

const short = (a) => (a && a.length > 24 ? a.slice(0, 12) + "…" + a.slice(-8) : a || "");
const when = (ms) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/New_York" });
const clock = (ms) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/New_York" });
const day = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const dateET = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many || one + "s"}`;
// Token amounts: 1.0B, 54.7M, 12.3k, else plain.
const amt = (n) => (!isFinite(n) ? "–" : Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B" : Math.abs(n) >= 1e4 ? compact(n) : fmt(n, n < 10 ? 2 : 0));
const ada = (n) => fmt(n, n < 10 ? 2 : n < 1000 ? 1 : 0);
const VENUE = { curve: "Bonding curve", minswap: "Minswap pool", "snek-splash": "Snek.fun (Splash)", splash: "Splash pool" };
const SOLSCAN = "https://solscan.io/";
const venue = (v) => VENUE[v] || (v ? v.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "–");

function notice(html) { const n = $("[data-notice]"); n.hidden = !html; n.innerHTML = html || ""; }

function resolve(input) {
  let s = (input || "").trim();
  // Accept a Solada.fun or Snek.fun coin link, a $ticker, or a coin id / slug.
  const m = s.match(/solada\.fun\/(?:coin|token|c)\/([A-Za-z0-9_-]+)/i) || s.match(/snek\.fun\/(?:token|coin)\/([0-9a-f]{58,})/i);
  if (m) s = m[1];
  s = s.replace(/^\$/, "");
  // Tickers can repeat across launchpads: a coin in the chosen launchpad scope wins, then any coin.
  const byTk = st.coins.filter((c) => (c.tk || "").toLowerCase() === s.toLowerCase());
  return byTk.find((c) => platform.inScope(c)) || byTk[0] || st.coins.find((c) => c.id === s || c.slug === s) || null;
}

function fillList() {
  const seen = new Set();
  $("[data-list]").innerHTML = st.coins.filter((c) => c.tk && platform.inScope(c) && !seen.has(c.tk + "|" + platform.srcOf(c)) && seen.add(c.tk + "|" + platform.srcOf(c)))
    .map((c) => `<option value="${esc(c.tk)}">${esc(c.name || "")}${platform.get() === "all" && c.src === "snek" ? " · Snek.fun" : ""}</option>`).join("");
}

async function loadList() {
  try {
    const j = await getApi("/tokens");
    st.coins = j.coins || [];
    st.adaUsd = Number(j.adaUsd) || null;
    let sources; try { sources = (await fetchFeed()).sources || undefined; } catch {}
    liveStatus({ updatedAt: new Date(j.updatedAt), sources });
    fillList();
  } catch (e) { liveStatus(null, e); }
}

// Reads up to `pages` more pages of older trades. Solada pages by timestamp (and repeats the boundary
// trade, so rows are de-duplicated); Snek.fun pages by offset, which the worker hands back as `next`.
async function loadPages(pages) {
  if (st.busy || !st.more || !st.coin) return;
  const run = st.run, c = st.coin;
  st.busy = true;
  const prog = $("[data-progress]");
  prog.hidden = false;
  buttons();
  try {
    for (let i = 0; i < pages && st.more && st.pages < MAX_PAGES; i++) {
      const j = await getApi("/coin-trades", { coin: c.slug || c.id, before: st.before });
      if (run !== st.run) return;
      if (j.dec != null) st.dec = Number(j.dec) || 0;
      const t = j.trades || [];
      for (const x of t) {
        const k = `${x.at}|${x.side}|${x.trader}|${x.tokens}|${x.ada}`;
        if (st.seen.has(k)) continue;
        st.seen.add(k);
        st.list.push({ at: Number(x.at), side: x.side === "sell" ? "sell" : "buy", ada: Number(x.ada) || 0, tokens: Number(x.tokens) / 10 ** st.dec, trader: x.trader || "", venue: x.venue || "", tx: x.tx || "" });
      }
      st.pages++;
      st.more = !!(j.more && t.length);
      if (t.length) st.before = j.next != null ? String(j.next) : String(t[t.length - 1].at);
      prog.textContent = `Reading trade history… ${fmt(st.list.length)} trades so far`;
      render();
    }
  } catch (err) {
    if (run !== st.run) return;
    if (!st.list.length && !st.pages) { st.more = false; notice(`<strong>Couldn't find ${esc(c.tk || c.id)}.</strong> Check the ticker, or paste the coin's Solada.fun or Snek.fun link. ${/404/.test(String(err.message || err)) ? "" : esc(err.message || err)}`); }
    else notice(`<strong>Couldn't read more of the trade history.</strong> ${esc(err.message || err)}. What loaded so far is shown below.`);
  } finally {
    if (run === st.run) { st.busy = false; prog.hidden = true; buttons(); render(); }
  }
}

function buttons() {
  const capped = st.pages >= MAX_PAGES && st.more;
  // Once Solada or Snek.fun says there's nothing older, the buttons go away instead of sitting there disabled.
  $("[data-older]").hidden = $("[data-all]").hidden = !st.more || capped;
  $("[data-older]").disabled = $("[data-all]").disabled = st.busy;
  $("[data-older]").textContent = st.busy ? "Loading…" : "Load older trades";
  $("[data-csv]").disabled = st.busy && !st.list.length;
}

// Cardano rows come from Solada / Snek.fun; Solana rows (Pump coins only) from GeckoTerminal plus the worker's archive.
function allRows() {
  const sol = st.sol && st.sol.trades || [];
  if (st.chain === "ada" || !sol.length) return st.list;
  if (st.chain === "sol") return sol;
  return st.list.concat(sol).sort((a, b) => b.at - a.at);
}
function filtered() {
  const w = st.wallet.toLowerCase();
  return allRows().filter((t) => (!st.side || t.side === st.side) && t.ada >= st.min && (!w || t.trader.toLowerCase().includes(w)));
}

function render() {
  if (!st.coin) return;
  const c = st.coin, rows = filtered();
  // Oldest trade reached and whether the full history is in.
  const oldest = st.list.length ? st.list[st.list.length - 1].at : null;
  const newest = st.list.length ? st.list[0].at : null;
  const capped = st.pages >= MAX_PAGES && st.more;
  const solN = st.sol && st.sol.trades ? st.sol.trades.length : 0;
  const solSpan = solN ? (st.sol.from ? `Solana side: back to ${dateET(st.sol.from)}` : "Solana side: last 24 hours") : "";
  $("[data-range]").textContent = !st.list.length ? solSpan : (st.more
    ? `Cardano side loaded back to ${when(oldest)} ET${capped ? " (5,000-trade limit)" : ""}`
    : `Cardano side complete: ${dateET(oldest)} to ${dateET(newest)}`) + (solN ? " · " + solSpan : "");
  const chips = $("[data-chains]");
  chips.hidden = !solN;
  const hasSol = solN && st.chain !== "ada";
  const approx = hasSol ? "~" : "";
  // KPIs over the filtered rows.
  let b = 0, s = 0, bAda = 0, sAda = 0, bTok = 0, sTok = 0;
  const wallets = new Set();
  const cRows = rows.filter(counted);
  for (const t of cRows) { if (t.side === "buy") { b++; bAda += t.ada; bTok += t.tokens; } else { s++; sAda += t.ada; sTok += t.tokens; } if (t.trader) wallets.add(t.trader); }
  const net = bAda - sAda;
  const kpi = (label, value, sub, cls = "") => `<div class="kpi"><span class="kpi-label">${label}</span><span class="kpi-value ${cls}">${value}</span><span class="kpi-sub">${sub}</span></div>`;
  $("[data-kpis]").innerHTML = [
    kpi("Trades", fmt(cRows.length), `${fmt(b)} buys · ${fmt(s)} sells${hasSol ? ` · ${fmt(cRows.filter((t) => t.chain === "sol").length)} on Solana` : ""}`),
    kpi("ADA in (buys)", approx + ada(bAda), `${amt(bTok)} tokens bought`, "pos"),
    kpi("ADA out (sells)", approx + ada(sAda), `${amt(sTok)} tokens sold`, "neg"),
    kpi("Net flow", approx + (net > 0 ? "+" : net < 0 ? "−" : "") + ada(Math.abs(net)) + " ADA", net > 0 ? "More ADA bought than sold" : net < 0 ? "More ADA sold than bought" : "Even", net > 0 ? "pos" : net < 0 ? "neg" : ""),
    kpi("Wallets", fmt(wallets.size), hasSol ? "Cardano and Solana addresses" : "distinct addresses in these trades"),
    kpi("Biggest trade", cRows.length ? approx + ada(Math.max(...cRows.map((t) => t.ada))) + " ADA" : "–", cRows.length ? (cRows.reduce((a, t) => (t.ada > a.ada ? t : a)).side === "buy" ? "a buy" : "a sell") : ""),
  ].join("");
  const shown = rows.slice(0, st.shown);
  $("[data-rows]").innerHTML = shown.length ? shown.map((t) => {
    const p = t.tokens > 0 ? t.ada / t.tokens : null;
    const sol = t.chain === "sol";
    const wl = t.trader ? `<a href="${sol ? SOLSCAN + "account/" : "https://cardanoscan.io/address/"}${esc(t.trader)}" target="_blank" rel="noopener" class="mono" title="${esc(t.trader)}"><span class="w-long">${esc(short(t.trader))}</span><span class="w-short">…${esc(t.trader.slice(-6))}</span></a>` : "–";
    const tx = t.tx ? ` <a class="cell-sub" href="${sol ? SOLSCAN + "tx/" : "https://cardanoscan.io/transaction/"}${esc(t.tx)}" target="_blank" rel="noopener">tx</a>` : "";
    const adaCell = sol ? `<span title="${t.quoteAmt != null ? esc(fmt(t.quoteAmt, 2)) + " " + esc(t.quote) + " ≈ " : ""}$${esc(fmt(t.usd, 2))}; shown in ADA at today's rate">~${ada(t.ada)}</span>` : ada(t.ada);
    const mirror = sol && t.mirror && st.chain !== "sol";
    return `<tr class="is-${t.side}${sol ? " is-sol" : ""}${mirror ? " is-mirror" : ""}"${mirror ? ` title="Solada settling the Cardano ${t.side} above on Solana: same trade, not counted again"` : ""}>
      <td class="th-when"><time datetime="${new Date(t.at).toISOString()}" title="${esc(when(t.at))} ET">${esc(clock(t.at))}</time><span class="cell-sub">${esc(day(t.at))}</span></td>
      <td><span class="badge" style="--k:var(--color-${t.side})">${t.side === "buy" ? "Buy" : "Sell"}</span>${sol ? `<span class="cell-sub">Solana</span>` : ""}</td>
      <td class="num ${t.side === "buy" ? "pos" : "neg"}">${adaCell}</td>
      <td class="num">${amt(t.tokens)}</td>
      <td class="num hide-sm">${p != null ? (sol ? "~" : "") + fmtPrice(p) : "–"}</td>
      <td>${wl}</td>
      <td class="hide-sm"><span class="cell-sub" style="font-family:var(--font-body)">${esc(venue(t.venue))}${mirror ? ` · settles the Cardano ${t.side}` : ""}</span>${tx}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="7"><div class="empty"><p>${st.list.length ? "No trades match these filters." : st.busy ? "Reading trades…" : "Nothing to show."}</p></div></td></tr>`;
  $("[data-more]").hidden = rows.length <= st.shown;
  $("[data-more]").textContent = `Show more (${fmt(rows.length - st.shown)} left)`;
  const f = rows.length !== allRows().length ? ` · ${fmt(rows.length)} match your filters` : "";
  const total = st.list.length + solN;
  const mirrors = solN ? st.sol.trades.filter((t) => t.mirror).length : 0;
  $("[data-count]").textContent = total ? `${plural(total, "trade")} loaded${solN ? ` (${fmt(st.list.length)} Cardano, ${fmt(solN)} Solana${mirrors ? `, ${fmt(mirrors)} of those settle Cardano trades` : ""})` : ""}${f}${st.more || solN ? "" : " · that's the whole history"}` : "";
  const u = new URL(location.href); u.searchParams.set("coin", c.tk || c.id); history.replaceState(null, "", u);
}

async function loadCoin(e) {
  if (e) e.preventDefault();
  const raw = $("[data-coin]").value;
  const c = resolve(raw);
  notice("");
  if (!c) {
    // Unknown ticker: let the worker try the raw id/slug anyway so pasted links to older coins still work.
    const s = raw.trim().replace(/^\$/, "");
    const m = s.match(/solada\.fun\/(?:coin|token|c)\/([A-Za-z0-9_-]+)/i) || s.match(/snek\.fun\/(?:token|coin)\/([0-9a-f]{58,})/i);
    const id = m ? m[1] : s;
    if (!id) return;
    st.coin = { id, slug: id, tk: id.length > 20 ? id.slice(0, 8) + "…" : id, name: "", src: /^[0-9a-f]{100,}$/i.test(id) ? "snek" : "solada" };
  } else st.coin = c;
  st.run++;
  st.list = []; st.seen = new Set(); st.before = ""; st.more = true; st.pages = 0; st.busy = false; st.shown = 200; st.dec = st.coin.src === "snek" ? 0 : 6; st.sol = null; st.chain = "";
  document.querySelectorAll("[data-chain]").forEach((x) => x.classList.toggle("is-on", !x.dataset.chain));
  const btn = $("[data-go]");
  btn.disabled = true; btn.textContent = "Loading…";
  const cc = st.coin, snek = cc.src === "snek";
  const im = cc.img ? `<img src="${esc(cc.img)}" alt="" width="36" height="36">` : "";
  $("[data-head]").innerHTML = `${im}<div><h2 class="panel-title">Every <a href="${esc(coinUrl(snek ? cc.id : cc.slug || cc.id))}" target="_blank" rel="noopener">${esc(cc.tk || "?")}</a> trade ${pill(snek ? "snek" : "solada", { button: false })}</h2><span class="cell-sub">${esc(cc.name || "")}${cc.name ? " · " : ""}<a href="./holders.html?coin=${encodeURIComponent(cc.tk || cc.id)}">Holder snapshot</a> · <a href="./followup.html?coin=${encodeURIComponent(cc.tk || cc.id)}">Alert follow-up</a></span></div>`;
  // The under-development note points at this coin's own launchpad page (the reference list).
  const dl = $("[data-dev-link]");
  if (dl) { dl.href = coinUrl(snek ? cc.id : cc.slug || cc.id); dl.textContent = `${cc.tk || "The coin"} on ${snek ? "Snek.fun" : "Solada"}`; }
  $("[data-result]").hidden = false;
  $("[data-table]").hidden = false;
  $("[data-rows]").innerHTML = Array.from({ length: 8 }, () => `<tr><td colspan="7"><div class="skel-block" style="min-height:32px"></div></td></tr>`).join("");
  $("[data-kpis]").innerHTML = "";
  $("[data-range]").textContent = "";
  $("[data-count]").textContent = "";
  try {
    // First page on its own so something shows fast, then the rest of the first batch.
    st.busy = false;
    await loadPages(1);
    if (!st.list.length && !st.more && $("[data-notice]").hidden) notice(`<strong>No trades reported for ${esc(cc.tk || cc.id)} yet.</strong>`);
    await loadPages(BATCH - 1);
    pumpNote(st.coin, st.run);
  } finally {
    btn.disabled = false; btn.textContent = "Show trades";
    render();
  }
}

// Solada "Pump" coins also trade on Solana (Pump.fun / PumpSwap). Solada only reports the ADA-side trades,
// so this list can look thin for them. The worker passes along the Solana mint and pool Solada created for
// the coin; DexScreener fills in the 24h totals. Older cached lists without a mint fall back to DexScreener's
// search, accepted only when ticker and name match and the pair was created within 10 minutes of the launch.
const DEX = { pumpswap: "PumpSwap", pumpfun: "Pump.fun", raydium: "Raydium", meteora: "Meteora", orca: "Orca" };
const solKey = (t) => `${t.tx}|${t.side}|${t.tokens}`;
async function pumpNote(c, run) {
  if (!c || c.kind !== "pump" || c.src !== "solada") return;
  let sol = null;
  try {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(c.mint ? "https://api.dexscreener.com/latest/dex/tokens/" + encodeURIComponent(c.mint) : "https://api.dexscreener.com/latest/dex/search?q=" + encodeURIComponent(c.tk || ""), { signal: ctl.signal });
    clearTimeout(tm);
    const j = r.ok ? await r.json() : null;
    const lc = (x) => String(x || "").trim().toLowerCase();
    const ps = ((j && j.pairs) || []).filter((x) => x.chainId === "solana" && x.baseToken && (c.mint ? x.baseToken.address === c.mint : lc(x.baseToken.symbol) === lc(c.tk) && lc(x.baseToken.name) === lc(c.name)
      && (!x.pairCreatedAt || !c.born || Math.abs(Number(x.pairCreatedAt) - Number(c.born)) < 6e5)))
      .sort((x, y) => ((y.volume && y.volume.h24) || 0) - ((x.volume && x.volume.h24) || 0));
    const pr = ps[0];
    if (pr) sol = { pair: pr.pairAddress, mint: pr.baseToken.address, b: (pr.txns && pr.txns.h24 && pr.txns.h24.buys) || 0, s: (pr.txns && pr.txns.h24 && pr.txns.h24.sells) || 0, vUsd: (pr.volume && pr.volume.h24) || 0, dex: DEX[pr.dexId] || pr.dexId, quote: (pr.quoteToken && pr.quoteToken.symbol) || "SOL", url: pr.url || null, trades: [] };
  } catch {}
  // DexScreener down or unaware of the pool: Solada's own pool address still gets us the trades.
  if (!sol && c.pair) sol = { pair: c.pair, mint: c.mint || null, b: null, s: null, vUsd: null, dex: "Pump.fun", quote: null, url: "https://dexscreener.com/solana/" + encodeURIComponent(c.pair), trades: [] };
  if (run !== st.run) return;
  // The Solana trades themselves, two sources read together: GeckoTerminal's last 24 hours (up to 300, no
  // key) and the worker's archive, which holds Solada's own record of the pool (what Solada's coin page
  // shows) plus every Solana trade the worker has seen since, so nothing drops out as the sources roll on.
  let gtErr = null, arch = null;
  if (sol && sol.pair) {
    const rate = st.adaUsd || null;
    const row = (t) => ({ at: t.at, side: t.side, ada: rate ? t.usd / rate : 0, usd: t.usd, quoteAmt: t.q == null ? null : t.q, quote: sol.quote, tokens: t.tokens, trader: t.trader || "", venue: `${sol.dex} · Solana`, tx: t.tx || "", chain: "sol" });
    const [fresh, stored] = await Promise.all([
      (async () => {
        const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 6000);
        const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(sol.pair)}/trades?trade_volume_in_usd_greater_than=0`, { signal: ctl.signal });
        clearTimeout(tm);
        if (!r.ok) throw new Error("HTTP " + r.status);
        const j = await r.json();
        const out = [];
        for (const d of j.data || []) {
          const a = d.attributes || {};
          if (a.is_anomalous) continue;
          const buy = a.kind === "buy";
          // For a buy the base token is received (to); for a sell it is given (from).
          out.push({ at: Date.parse(a.block_timestamp), side: buy ? "buy" : "sell", tokens: Number(buy ? a.to_token_amount : a.from_token_amount) || 0, q: Number(buy ? a.from_token_amount : a.to_token_amount) || 0, usd: Number(a.volume_in_usd) || 0, trader: a.tx_from_address || "", tx: a.tx_hash || "" });
        }
        return out;
      })().catch((e) => { gtErr = String(e && e.message || e); return []; }),
      getApi("/coin-trades", { coin: c.slug || c.id, chain: "sol" }).catch(() => null)
    ]);
    if (run !== st.run) return;
    arch = stored && stored.src === "gecko" ? stored : null;
    if (arch && arch.quote && !sol.quote) sol.quote = arch.quote;
    if (arch && arch.dex && sol.dex === "Pump.fun") sol.dex = arch.dex;
    if (!sol.quote) sol.quote = "USDC";
    const seen = new Set();
    for (const t of fresh.concat(arch && arch.trades || [])) { const k = solKey(t); if (!seen.has(k)) { seen.add(k); sol.trades.push(row(t)); } }
    sol.trades.sort((x, y) => y.at - x.at);
    markMirrors(sol.trades);
    // How far back the Solana side reaches: the oldest archived trade (null when the archive has nothing yet).
    sol.from = arch && arch.trades && arch.trades.length ? Math.min(...arch.trades.map((t) => t.at)) : null;
    if (!rate && sol.trades.length) gtErr = gtErr || "no ADA rate";
  }
  if (run !== st.run) return;
  st.sol = sol;
  render();
  const t = esc(c.tk || c.id);
  const withSol = sol && sol.trades.length;
  const span = sol && sol.from ? `back to ${esc(dateET(sol.from))}` : "from the last 24 hours";
  let html = withSol
    ? `<strong>${t} is a Solada Pump coin, so it trades on two chains.</strong> Solada reports its ADA trades on Cardano (${plural(st.list.length, "trade")} in total). Its Solana trades ${span} (${plural(sol.trades.length, "trade")} on ${esc(sol.dex)}, paired with ${esc(sol.quote)}) are in the list too, marked Solana and shown in ~ADA at today's rate.${sol.trades.filter((x) => x.mirror).length ? " Solada settles each ADA trade on the Solana pool a minute or so later with the same token amount; those Solana rows are dimmed and not counted twice." : ""}${sol.from ? " They come from Solada's record of the pool and GeckoTerminal's last 24 hours; Gator Eyes keeps every one it has seen." : " Only the last 24 hours of Solana trades could be read right now; Gator Eyes keeps every one it sees from here on."}`
    : `<strong>${t} is a Solada Pump coin, so this is only its ADA side.</strong> Solada reports just the trades made in ADA on Cardano (${plural(st.list.length, "trade")} so far). ${t} also trades on Solana, and those trades aren't in this list because Solada doesn't publish them one by one.`;
  // Solada's ADA-side record for Pump coins starts well after some of them launched; say so instead of calling it complete.
  const oldest = st.list.length ? st.list[st.list.length - 1].at : null;
  if (!st.more && oldest && c.born && oldest - c.born > 2 * 864e5) html += ` Solada's record of its ADA trades starts ${esc(dateET(oldest))}, though the coin launched ${esc(dateET(c.born))}, so earlier ADA trades aren't available either.`;
  if (sol) {
    const n = (sol.b || 0) + (sol.s || 0);
    const usd = sol.vUsd >= 100 ? fmt(sol.vUsd) : Number(sol.vUsd || 0).toFixed(2);
    if (!withSol) html += sol.b == null ? ` The Solana trade list couldn't be read right now.` : n ? ` On Solana (${esc(sol.dex)}, paired with ${esc(sol.quote)}) DexScreener counts ${fmt(n)} trades in the last 24 hours, ${fmt(sol.b)} buys and ${fmt(sol.s)} sells, about $${usd} traded${gtErr ? ", but the trade list couldn't be read right now" : ""}.` : ` No Solana trades in the last 24 hours either.`;
    else if (gtErr && gtErr !== "no ADA rate") html += ` The live Solana pull failed just now (${esc(gtErr)}), so the Solana rows are the archived ones.`;
    if (sol.url) html += ` <a href="${esc(sol.url)}" target="_blank" rel="noopener">Solana chart on DexScreener</a>.`;
  } else html += ` Solada's coin page shows the Solana side.`;
  notice(html);
}

// Solada settles each ADA-side trade on the Solana pool within about a minute, with the exact same token
// amount. Those Solana rows are the same trade seen from the other chain, so they're marked and left out of
// the combined totals rather than counted twice.
function markMirrors(solTrades) {
  for (const x of solTrades) {
    x.mirror = st.list.some((t) => t.side === x.side && Math.abs(t.at - x.at) < 10 * 6e4 && t.tokens > 0 && Math.abs(t.tokens - x.tokens) / t.tokens < 1e-4);
  }
}
const counted = (t) => !(t.mirror && st.chain !== "sol");

function csv() {
  const c = st.coin, rows = filtered();
  if (!c || !rows.length) return;
  const lines = ["time_et,time_iso,chain,side,ada,ada_is_estimate,quote_amount,quote_symbol,usd,tokens,price_ada_per_token,wallet,venue,tx,settles_cardano_trade"];
  const cell = (x) => '"' + String(x ?? "").replace(/"/g, '""') + '"';
  for (const t of rows) {
    const sol = t.chain === "sol";
    lines.push([when(t.at), new Date(t.at).toISOString(), sol ? "solana" : "cardano", t.side, sol ? t.ada.toFixed(2) : t.ada, sol ? "yes" : "no", sol ? (t.quoteAmt == null ? "" : t.quoteAmt) : t.ada, sol ? t.quote : "ADA", sol ? t.usd.toFixed(2) : "", t.tokens, t.tokens > 0 ? (t.ada / t.tokens).toPrecision(8) : "", t.trader, t.venue, t.tx, sol ? (t.mirror ? "yes" : "no") : ""].map(cell).join(","));
  }
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(c.tk || c.id).replace(/[^A-Za-z0-9_-]/g, "")}-trades-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

$("[data-pick]").addEventListener("submit", loadCoin);
document.querySelectorAll("[data-side]").forEach((b) => b.addEventListener("click", () => {
  st.side = b.dataset.side;
  document.querySelectorAll("[data-side]").forEach((x) => x.classList.toggle("is-on", x === b));
  st.shown = 200; render();
}));
document.querySelectorAll("[data-chain]").forEach((b) => b.addEventListener("click", () => {
  st.chain = b.dataset.chain;
  document.querySelectorAll("[data-chain]").forEach((x) => x.classList.toggle("is-on", x === b));
  st.shown = 200; render();
}));
$("[data-min]").addEventListener("input", (e) => { st.min = Number(e.target.value) || 0; st.shown = 200; render(); });
$("[data-wallet]").addEventListener("input", (e) => { st.wallet = e.target.value.trim(); st.shown = 200; render(); });
$("[data-older]").addEventListener("click", () => loadPages(BATCH));
$("[data-all]").addEventListener("click", () => loadPages(MAX_PAGES));
$("[data-more]").addEventListener("click", () => { st.shown += 200; render(); });
$("[data-csv]").addEventListener("click", csv);

await loadList();
const q = new URLSearchParams(location.search);
const pre = q.get("coin");
if (q.get("wallet")) { st.wallet = q.get("wallet"); $("[data-wallet]").value = st.wallet; }
if (pre) { $("[data-coin]").value = pre; loadCoin(); }

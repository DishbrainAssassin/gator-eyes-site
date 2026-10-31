// Holder snapshot: every Cardano holder of a Solada.fun or Snek.fun coin, filtered by rules,
// ready to download as a CSV for airdrops.
import { getApi } from "./api.js?v=20261031v";
import { coinUrl, fetchFeed } from "./data.js?v=20261031v";
import { esc, fmt, compact, timeAgo } from "./ui.js?v=20261031v";
import { wireLinks, liveStatus } from "./common.js?v=20261031v";
import * as platform from "./platform.js?v=20261031v";
import { pill } from "./platform.js?v=20261031v";

wireLinks();
platform.mount();
platform.on(() => fillList());
const $ = (s) => document.querySelector(s);
const R = (k) => document.querySelector(`[data-r="${k}"]`);
const st = { coins: [], snap: null, trades: null, tradesKey: "", out: [], more: false, busy: 0 };

const short = (a) => (a && a.length > 24 ? a.slice(0, 12) + "…" + a.slice(-8) : a || "");
const isScript = (a) => /^addr1[zxw]/.test(a || "");
const etMidnight = (v) => {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  // Midnight Eastern: try EDT (UTC-4), fall back to EST (UTC-5) when the offset doesn't match.
  for (const off of [4, 5]) {
    const t = Date.UTC(y, m - 1, d, off);
    const h = Number(new Date(t).toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/New_York" }));
    if (h === 0) return t;
  }
  return Date.UTC(y, m - 1, d, 5);
};

function notice(html) { const n = $("[data-notice]"); n.hidden = !html; n.innerHTML = html || ""; }

function resolve(input) {
  let s = (input || "").trim();
  // Accept a Solada.fun or Snek.fun coin link, a $ticker, or a coin id / slug.
  const m = s.match(/solada\.fun\/(?:coin|token|c)\/([A-Za-z0-9_-]+)/i) || s.match(/snek\.fun\/(?:token|coin)\/([0-9a-f]{58,})/i);
  if (m) s = m[1];
  s = s.replace(/^\$/, "");
  // Tickers can repeat across launchpads: a coin in the chosen launchpad scope wins, then any coin.
  const byTk = st.coins.filter((c) => (c.tk || "").toLowerCase() === s.toLowerCase());
  const hit = byTk.find((c) => platform.inScope(c)) || byTk[0] || st.coins.find((c) => c.id === s || c.slug === s);
  return hit ? hit.slug || hit.id : s;
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
    let sources; try { sources = (await fetchFeed()).sources || undefined; } catch {}
    liveStatus({ updatedAt: new Date(j.updatedAt), sources });
    fillList();
  } catch (e) { liveStatus(null, e); }
}

async function loadCoin(e) {
  if (e) e.preventDefault();
  const id = resolve($("[data-coin]").value);
  if (!id) return;
  const btn = $("[data-go]");
  btn.disabled = true; btn.textContent = "Loading…";
  notice("");
  try {
    const j = await getApi("/holders", { coin: id });
    st.snap = j; st.trades = null; st.more = false;
    const c = j.coin;
    let dec = Number(c.decimals) || 0;
    if (!dec && c.supply) dec = Math.max(0, Math.round(Math.log10(Number(c.supply))) - 9);
    st.dec = dec;
    const im = c.img ? `<img src="${esc(c.img)}" alt="" width="36" height="36">` : "";
    const snek = c.src === "snek";
    $("[data-head]").innerHTML = `${im}<div><h2 class="panel-title"><a href="${esc(coinUrl(snek ? c.id : c.slug || c.id))}" target="_blank" rel="noopener">${esc(c.tk || "?")}</a> holders ${pill(snek ? "snek" : "solada", { button: false })}</h2><span class="cell-sub">${esc(c.name || "")} · ${fmt(j.holders.length)} addresses on Cardano${snek ? " · Snek.fun has no address labels, so its curve and pool contracts fall under \"other contracts\"" : ""}</span></div>`;
    $("[data-taken]").textContent = "Snapshot taken " + new Date(j.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
    $("[data-rules]").hidden = false;
    $("[data-result]").hidden = false;
    const u = new URL(location.href); u.searchParams.set("coin", c.tk || id); history.replaceState(null, "", u);
    await apply();
  } catch (err) {
    notice(`<strong>Couldn't load holders.</strong> ${esc(err.message || err)}. Check the ticker or paste the coin link from Solada.fun or Snek.fun.`);
  } finally { btn.disabled = false; btn.textContent = "Load holders"; }
}

// Pages back through the coin's launchpad trades until `stopAt` (or the start).
// Solada pages by timestamp; Snek.fun pages by offset, which the worker hands back as `next`.
async function tradesUntil(stopAt) {
  if (st.trades && st.trades.id === st.snap.coin.id && st.trades.reach <= stopAt) return st.trades.list;
  const list = [];
  let before = "", pages = 0, more = true, reach = Date.now();
  const prog = $("[data-progress]");
  prog.hidden = false;
  while (more && pages < 100 && reach > stopAt) {
    const j = await getApi("/coin-trades", { coin: st.snap.coin.slug || st.snap.coin.id, before });
    list.push(...j.trades);
    pages++;
    more = j.more && j.trades.length;
    if (j.trades.length) { reach = j.trades[j.trades.length - 1].at; before = j.next != null ? j.next : reach; }
    prog.textContent = `Reading trade history… ${fmt(list.length)} trades so far`;
  }
  prog.hidden = true;
  st.trades = { id: st.snap.coin.id, list, reach: more ? reach : 0, capped: more && pages >= 100 };
  return list;
}

async function apply() {
  const s = st.snap;
  if (!s) return;
  const run = ++st.busy;
  const c = s.coin, now = Date.now(), div = 10 ** st.dec;
  const rules = { curve: R("curve").checked, locks: R("locks").checked, script: R("script").checked, dev: R("dev").checked, stake: R("stake").checked, min: Number(R("min").value) || 0, top: Math.max(0, Math.floor(Number(R("top").value) || 0)), skip: new Set(R("skip").value.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean)), before: etMidnight(R("before").value), nosell: etMidnight(R("nosell").value) };
  const left = { curve: 0, locks: 0, script: 0, dev: 0, skip: 0, min: 0, before: 0, nosell: 0, top: 0 };
  const leftQty = { ...left };
  const total = s.holders.reduce((a, h) => a + Number(h.qty), 0);

  let rows = [];
  for (const h of s.holders) {
    const q = Number(h.qty);
    let why = null;
    if (rules.curve && (h.label === "curve" || h.label === "pool" || h.addr === c.curveAddress)) why = "curve";
    else if (rules.locks && h.lockedUntilMs && h.lockedUntilMs > now) why = "locks";
    else if (rules.dev && (h.label === "dev" || (c.launcher && (h.addr === c.launcher || h.stake === c.launcher)))) why = "dev";
    else if (rules.script && isScript(h.addr)) why = "script";
    else if (rules.skip.has(h.addr) || (h.stake && rules.skip.has(h.stake))) why = "skip";
    if (why) { left[why]++; leftQty[why] += q; continue; }
    rows.push({ key: rules.stake && h.stake ? h.stake : h.addr, addr: h.addr, stake: h.stake, qty: q, addrs: [h.addr] });
  }
  if (rules.stake) {
    const m = new Map();
    for (const r of rows) {
      const g = m.get(r.key);
      if (g) { g.qty += r.qty; g.addrs.push(r.addr); if (r.qty > g.top) { g.top = r.qty; g.addr = r.addr; } }
      else m.set(r.key, { ...r, top: r.qty });
    }
    rows = [...m.values()];
  }

  if (rules.before || rules.nosell) {
    const stop = Math.min(rules.before ? 0 : Infinity, rules.nosell || Infinity);
    let trades;
    try { trades = await tradesUntil(stop === Infinity ? 0 : stop); }
    catch (err) { notice(`<strong>Couldn't read the trade history.</strong> ${esc(err.message || err)}. Date rules were skipped.`); trades = null; }
    if (run !== st.busy) return;
    if (trades) {
      const early = new Set(), sold = new Set();
      for (const t of trades) {
        if (rules.before && t.side === "buy" && t.at < rules.before) early.add(t.trader);
        if (rules.nosell && t.side === "sell" && t.at >= rules.nosell) sold.add(t.trader);
      }
      rows = rows.filter((r) => {
        const has = (set) => r.addrs.some((a) => set.has(a)) || (r.stake && set.has(r.stake));
        if (rules.before && !has(early)) { left.before++; leftQty.before += r.qty; return false; }
        if (rules.nosell && has(sold)) { left.nosell++; leftQty.nosell += r.qty; return false; }
        return true;
      });
      if (st.trades.capped) notice("<strong>Long trade history.</strong> Only the most recent 5,000 trades were read, so the oldest buys may be missing.");
    }
  }
  if (run !== st.busy) return;

  rows = rows.filter((r) => { if (r.qty / div < rules.min) { left.min++; leftQty.min += r.qty; return false; } return true; });
  rows.sort((a, b) => b.qty - a.qty);
  if (rules.top && rows.length > rules.top) { for (const r of rows.slice(rules.top)) { left.top++; leftQty.top += r.qty; } rows = rows.slice(0, rules.top); }

  const kept = rows.reduce((a, r) => a + r.qty, 0);
  rows.forEach((r) => (r.share = kept ? (r.qty / kept) * 100 : 0));
  st.out = rows;

  const top10 = rows.slice(0, 10).reduce((a, r) => a + r.share, 0);
  $("[data-kpis]").innerHTML = [
    [rules.stake ? "Wallets in the list" : "Addresses in the list", fmt(rows.length)],
    ["Tokens they hold", compact(kept / div)],
    ["Share of supply held", total ? ((kept / total) * 100).toFixed(1) + "%" : "–"],
    ["Top 10 hold", rows.length ? top10.toFixed(1) + "% of the list" : "–"],
  ].map(([l, v]) => `<div class="kpi"><span class="kpi-label">${esc(l)}</span><span class="kpi-value">${esc(v)}</span></div>`).join("");

  const names = { curve: "curve and pools", locks: "locked", script: "other contracts", dev: "creator", skip: "your skip list", min: "under the minimum", before: "didn't buy before the date", nosell: "sold since the date", top: "outside the top " + rules.top };
  const bits = Object.entries(left).filter(([, n]) => n).map(([k, n]) => `${names[k]}: ${fmt(n)} (${fmt(leftQty[k] / div)} tokens)`);
  $("[data-left]").textContent = bits.length ? "Left out — " + bits.join(" · ") : "Nothing left out.";

  renderRows();
  $("[data-csv]").disabled = $("[data-copy]").disabled = !rows.length;
}

function renderRows() {
  const div = 10 ** st.dec;
  const shown = st.more ? st.out : st.out.slice(0, 100);
  $("[data-rows]").innerHTML = shown.length ? shown.map((r, i) => `<tr>
    <td class="num">${i + 1}</td>
    <td><a class="mono" href="https://cardanoscan.io/${r.stake ? "stakekey/" + esc(r.stake) : "address/" + esc(r.addr)}" target="_blank" rel="noopener" title="${esc(r.stake || r.addr)}">${esc(short(r.stake && R("stake").checked ? r.stake : r.addr))}</a></td>
    <td class="num">${fmt(r.qty / div, 2)}</td>
    <td class="num">${r.share.toFixed(r.share < 0.1 ? 3 : 2)}%</td>
    <td class="hide-sm"><span class="cell-sub">${r.addrs.length > 1 ? r.addrs.length + " addresses" : ""}</span></td>
  </tr>`).join("") : `<tr><td colspan="5"><div class="empty"><p>No holders match these rules.</p></div></td></tr>`;
  $("[data-more]").hidden = st.more || st.out.length <= 100;
  $("[data-more]").textContent = `Show all ${fmt(st.out.length)}`;
}

function csv() {
  const div = 10 ** st.dec;
  const c = st.snap.coin;
  const lines = ["rank,address,stake_address,balance,share_pct,addresses"];
  st.out.forEach((r, i) => lines.push([i + 1, r.addr, r.stake || "", (r.qty / div).toFixed(st.dec), r.share.toFixed(6), r.addrs.length].join(",")));
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(c.tk || c.id).replace(/[^A-Za-z0-9_-]/g, "")}-holders-${new Date(st.snap.at).toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

$("[data-pick]").addEventListener("submit", loadCoin);
document.querySelectorAll("[data-r]").forEach((el) => el.addEventListener(el.tagName === "TEXTAREA" || el.type === "number" ? "input" : "change", () => { clearTimeout(st.t); st.t = setTimeout(apply, 250); }));
$("[data-csv]").addEventListener("click", csv);
$("[data-copy]").addEventListener("click", async (e) => {
  const b = e.currentTarget;
  try { await navigator.clipboard.writeText(st.out.map((r) => r.addr).join("\n")); b.textContent = "Copied " + fmt(st.out.length); }
  catch { b.textContent = "Copy failed"; }
  setTimeout(() => (b.textContent = "Copy addresses"), 2000);
});
$("[data-more]").addEventListener("click", () => { st.more = true; renderRows(); });

await loadList();
const pre = new URLSearchParams(location.search).get("coin");
if (pre) { $("[data-coin]").value = pre; loadCoin(); }

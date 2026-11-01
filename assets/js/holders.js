// Holder snapshot: where a Solada.fun or Snek.fun coin's supply sits on Cardano, then a filtered
// holder list ready to filter and download as a CSV.
import { getApi } from "./api.js?v=20261101-clean3";
import { coinUrl, fetchFeed } from "./data.js?v=20261101-clean3";
import { esc, fmt, compact } from "./ui.js?v=20261101-clean3";
import { wireLinks, liveStatus } from "./common.js?v=20261101-clean3";
import * as platform from "./platform.js?v=20261101-clean3";
import { pill } from "./platform.js?v=20261101-clean3";

wireLinks();
platform.mount();
platform.on(() => fillList());
const $ = (s) => document.querySelector(s);
const R = (k) => document.querySelector(`[data-r="${k}"]`);
const st = { coins: [], snap: null, trades: null, out: [], more: false, busy: 0, groups: null, on: null };

const short = (a) => (a && a.length > 24 ? a.slice(0, 12) + "…" + a.slice(-8) : a || "");
const isScript = (a) => /^addr1[zxw]/.test(a || "");
// Payment-only address: no stake part, so it can't be grouped with a wallet's other addresses.
const noStake = (a, stake) => !stake && /^addr1v/.test(a || "");
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
const dateET = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const pct = (n, d = 1) => (!isFinite(n) ? "–" : n > 0 && n < 0.05 ? "<0.1%" : n.toFixed(d) + "%");
// Token amounts: 1.0B, 54.7M, 12.3k.
const amt = (n) => (Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B" : compact(n));
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many || one + "s"}`;

// The groups every address falls into, in the order they're checked. An address lands in the first
// group that matches, so a creator-owned lock counts as locked, and a creator-owned contract as creator.
const GROUPS = {
  curve: { name: "Bonding curve", color: "var(--color-amber)", on: false, what: "Tokens held at the launchpad's bonding-curve address, not an ordinary holder wallet." },
  pool: { name: "Liquidity pools", color: "var(--color-spike)", on: false, what: "Tokens held in verified liquidity-pool contracts, not ordinary holder wallets." },
  locked: { name: "Locked", color: "var(--color-launch)", on: false, what: "Tokens sitting in a lock until a future date." },
  lockcontract: { name: "Lock contracts", color: "#b697d4", on: false, what: "Tokens still held in the Spectrum/Splash locking contract. A passed unlock date does not mean they have been withdrawn." },
  burn: { name: "Burn address", color: "#d18c6b", on: false, what: "Tokens sent to the published $burnsnek burn address. Kept in the supply breakdown, but left out of the holder list by default." },
  dev: { name: "Creator", color: "var(--color-sell)", on: false, what: "The wallet that launched the coin, plus anything Solada labels as the creator's." },
  solada: { name: "Solada's wallets", color: "#5fd3b8", on: false, what: "Solada's own wallets, named on its proof-of-reserves page: the reserve that keeps Pump coins until someone buys them, the orders wallet and the pool wallet." },
  script: { name: "Other contracts", color: "var(--color-text-faint)", on: false, what: "Script addresses such as DEX orders, vaults and bots." },
  nostake: { name: "No stake key", color: "#c9a26b", on: true, what: "Payment-only addresses with no stake key. Exchanges and services often use these. They can't be grouped into a wallet." },
  wallet: { name: "Wallets", color: "var(--color-buy)", on: true, what: "Wallet addresses not assigned to the categories above. This is not a count of individual people." }
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

function groupOf(h, c, now) {
  if (h.label === "burn") return "burn";
  if (h.label === "lock") return "lockcontract";
  if (h.label === "curve" || (c.curveAddress && h.addr === c.curveAddress)) return "curve";
  if (h.label === "pool") return "pool";
  if (h.lockedUntilMs && h.lockedUntilMs > now) return "locked";
  if (h.label === "dev" || (c.launcher && (h.addr === c.launcher || h.stake === c.launcher))) return "dev";
  if (h.label === "solada") return "solada";
  if (isScript(h.addr)) return "script";
  if (noStake(h.addr, h.stake)) return "nostake";
  return "wallet";
}

// Sorts every address into a group once per snapshot. Toggles and rules work from this.
function classify() {
  const s = st.snap, c = s.coin, now = Date.now();
  const total = s.holders.reduce((a, h) => a + Number(h.qty), 0);
  const g = {};
  for (const k of Object.keys(GROUPS)) g[k] = { n: 0, qty: 0, lockMin: Infinity, lockMax: 0, dev: 0 };
  for (const h of s.holders) {
    const k = groupOf(h, c, now);
    h.group = k;
    g[k].n++; g[k].qty += Number(h.qty);
    if (k === "locked") { g[k].lockMin = Math.min(g[k].lockMin, h.lockedUntilMs); g[k].lockMax = Math.max(g[k].lockMax, h.lockedUntilMs); if (h.label === "dev" || (c.launcher && (h.addr === c.launcher || h.stake === c.launcher))) g[k].dev++; }
  }
  st.groups = { total, g };
  if (!st.on) st.on = Object.fromEntries(Object.entries(GROUPS).map(([k, v]) => [k, v.on]));
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
    st.snap = j; st.trades = null; st.more = false; st.on = null;
    const c = j.coin;
    let dec = Number(c.decimals) || 0;
    if (!dec && c.supply) dec = Math.max(0, Math.round(Math.log10(Number(c.supply))) - 9);
    st.dec = dec;
    classify();
    const im = c.img ? `<img src="${esc(c.img)}" alt="" width="36" height="36">` : "";
    const snek = c.src === "snek";
    $("[data-head]").innerHTML = `${im}<div><h2 class="panel-title">Where <a href="${esc(coinUrl(snek ? c.id : c.slug || c.id))}" target="_blank" rel="noopener">${esc(c.tk || "?")}</a>'s supply sits ${pill(snek ? "snek" : "solada", { button: false })}</h2><span class="cell-sub">${esc(c.name || "")} · ${plural(j.holders.length, "address", "addresses")} on Cardano hold the coin</span></div>`;
    $("[data-taken]").textContent = "Snapshot taken " + new Date(j.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
    $("[data-story]").hidden = false;
    $("[data-rules]").hidden = false;
    $("[data-result]").hidden = false;
    const u = new URL(location.href); u.searchParams.set("coin", c.tk || id); history.replaceState(null, "", u);
    renderStory();
    await apply();
  } catch (err) {
    notice(`<strong>Couldn't load holders.</strong> ${esc(err.message || err)}. Check the ticker or paste the coin link from Solada.fun or Snek.fun.`);
  } finally { btn.disabled = false; btn.textContent = "Load holders"; }
}

// Plain words for Solada's own wallets, using the names from its proof-of-reserves page.
const SOLADA_WORDS = {
  "Solada reserve": "Solada's reserve wallet (Cardano copies of a Pump coin waiting for someone to buy them)",
  "Solada orders": "Solada's orders wallet (trades not yet filled or refunded)",
  "Solada pool": "Solada's pool wallet (its own share of the Minswap pool)"
};
function soladaWords(rows) {
  const names = [...new Set(rows.map((h) => h.name).filter(Boolean))];
  // Only Pump coins have Cardano copies waiting in the reserve. For a Cardano-only coin (one with a curve) it's just Solada's operating wallet.
  if (names.length === 1 && names[0] === "Solada reserve" && (st.snap.coin.src === "snek" || st.snap.coin.curveAddress)) return "Solada's reserve wallet (the platform's own operating wallet)";
  if (names.length === 1) return SOLADA_WORDS[names[0]] || `Solada's own "${names[0]}" wallet`;
  return "Solada's own wallets (" + names.map((n) => n.replace(/^Solada /, "")).join(", ") + ")";
}

function lockExplanation(rows) {
  const now = Date.now(), div = 10 ** st.dec;
  let active = 0, matured = 0, unknown = 0, earliest = Infinity, latest = 0;
  for (const h of rows) {
    if (!h.lockDatesVerified || !Array.isArray(h.lockSchedule)) { unknown += Number(h.qty); continue; }
    for (const l of h.lockSchedule) {
      if (l.untilMs > now) {
        active += Number(l.qty); earliest = Math.min(earliest, l.untilMs); latest = Math.max(latest, l.untilMs);
      } else matured += Number(l.qty);
    }
  }
  const sentences = [];
  if (active) sentences.push(`${amt(active / div)} tokens are still time-locked, with unlock dates ${earliest === latest ? dateET(earliest) : dateET(earliest) + " to " + dateET(latest)}.`);
  if (matured) sentences.push(`${amt(matured / div)} tokens are past their unlock date but remain in the contract.`);
  if (unknown) sentences.push(`Unlock dates for ${amt(unknown / div)} tokens could not be verified; contract custody does not prove an active lock.`);
  return sentences.join(" ") || "Spectrum/Splash locking contract. Unlock dates are not verified.";
}

// The supply bar, the group cards and the one-paragraph story above them.
function renderStory() {
  const { total, g } = st.groups, c = st.snap.coin, div = 10 ** st.dec, snek = c.src === "snek";
  const share = (k) => (total ? (g[k].qty / total) * 100 : 0);
  const keys = Object.keys(GROUPS).filter((k) => g[k].n || k === "wallet");

  $("[data-bar]").innerHTML = keys.filter((k) => g[k].qty).map((k) => `<i style="--w:${share(k).toFixed(3)}%;--c:${GROUPS[k].color}" title="${esc(GROUPS[k].name)} ${pct(share(k))}"></i>`).join("");

  $("[data-keys]").innerHTML = keys.map((k) => {
    const G = GROUPS[k], x = g[k], on = st.on[k];
    let what = G.what;
    if (k === "script") what = "Script addresses we haven't identified. These may include orders, vaults or unrecognized contracts; no purpose is assumed.";
    if (k === "locked" && x.n) what = `Tokens in a lock until ${x.lockMin === x.lockMax ? dateET(x.lockMin) : dateET(x.lockMin) + " to " + dateET(x.lockMax)}${x.dev ? ", including the creator's" : ""}.`;
    if (k === "curve" && c.cs === "graduated") what = "Balance still at the bonding-curve address after graduation. Not an ordinary holder wallet.";
    if (k === "pool") {
      const venues = [...new Set(st.snap.holders.filter((h) => h.group === "pool").map((h) => h.venue || (snek ? "unidentified venue" : "Minswap")))];
      what = `Tokens in ${venues.join(" and ")} liquidity-pool contracts. Not ordinary holder wallets.`;
    }
    if (k === "lockcontract") what = lockExplanation(st.snap.holders.filter((h) => h.group === k));
    if (k === "solada" && x.n) { const w = soladaWords(st.snap.holders.filter((h) => h.group === "solada")); what = w.charAt(0).toUpperCase() + w.slice(1) + ". Named on Solada's proof-of-reserves page; not a holder."; }
    const empty = !x.n;
    return `<button type="button" class="skey${on ? " is-on" : ""}${empty ? " is-empty" : ""}" data-key="${k}" aria-pressed="${on}" ${empty ? "disabled" : ""} style="--c:${G.color}">
      <span class="skey-top"><i></i><b>${esc(G.name)}</b></span>
      <span class="skey-big">${empty ? "0%" : pct(share(k))}<em>${on ? "in the list" : empty ? "none" : "left out"}</em></span>
      <span class="skey-sub">${empty ? "No addresses" : plural(x.n, "address", "addresses") + " · " + amt(x.qty / div) + " tokens"}</span>
      <span class="skey-what">${esc(what)}</span>
    </button>`;
  }).join("");
  $("[data-keys]").querySelectorAll("[data-key]").forEach((b) => b.addEventListener("click", () => { st.on[b.dataset.key] = !st.on[b.dataset.key]; renderStory(); apply(); }));

  // One paragraph that says where the supply is, in plain words.
  const tk = c.tk || "this coin";
  const parts = [];
  const shows = (k) => share(k) >= 0.05;
  if (shows("curve")) parts.push(`${pct(share("curve"))} is at the bonding-curve address`);
  if (shows("pool")) parts.push(`${pct(share("pool"))} sits in liquidity pools`);
  if (shows("locked")) parts.push(`${pct(share("locked"))} is locked across ${plural(g.locked.n, "address", "addresses")}${g.locked.dev ? ", the creator's included" : ""}`);
  if (shows("lockcontract")) parts.push(`${pct(share("lockcontract"))} remains in lock contracts`);
  if (shows("burn")) parts.push(`${pct(share("burn"))} is at the burn address`);
  if (shows("dev")) parts.push(`${pct(share("dev"))} is with the creator`);
  if (shows("solada")) parts.push(`${pct(share("solada"))} is in ${soladaWords(st.snap.holders.filter((h) => h.group === "solada"))}`);
  if (shows("script")) parts.push(`${pct(share("script"))} is in unidentified contracts`);
  if (shows("nostake")) parts.push(`${pct(share("nostake"))} is in ${plural(g.nostake.n, "payment-only address", "payment-only addresses")} with no stake key`);
  const w = g.wallet;
  const walletShare = share("wallet");
  const wallets = st.snap.holders.filter((h) => h.group === "wallet");
  const byStake = new Map();
  for (const h of wallets) { const k = h.stake || h.addr; byStake.set(k, (byStake.get(k) || 0) + Number(h.qty)); }
  const sorted = [...byStake.values()].sort((a, b) => b - a);
  const biggest = sorted[0] || 0, top10 = sorted.slice(0, 10).reduce((a, b) => a + b, 0);
  let text = `Of ${tk}'s ${amt(total / div)} tokens on Cardano, ` + (parts.length ? parts.join(", ").replace(/, ([^,]*)$/, " and $1") + ". " : "nothing sits in the curve, pool, locks or contracts. ");
  text += `${pct(walletShare)} is in ${plural(byStake.size, "wallet")} not assigned to the categories above`;
  if (biggest && w.qty) text += `; the biggest holds ${pct((biggest / w.qty) * 100)} of that and the top ten hold ${pct((top10 / w.qty) * 100)}.`;
  else text += ".";
  if (g.lockcontract.qty) text += " " + lockExplanation(st.snap.holders.filter((h) => h.group === "lockcontract"));
  if (g.burn.qty) text += " These supply percentages include the burn address; they are not circulating-supply percentages.";
  const bigNoStake = st.snap.holders.filter((h) => h.group === "nostake").sort((a, b) => Number(b.qty) - Number(a.qty))[0];
  if (bigNoStake && total && Number(bigNoStake.qty) / total > 0.2) text += ` One payment-only address holds ${pct((Number(bigNoStake.qty) / total) * 100)} on its own and ${snek ? "Snek.fun" : "Solada"} doesn't label it. Open it on Cardanoscan before you decide whether to include it in your filtered list.`;
  $("[data-story-text]").textContent = text;
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
  const c = s.coin, div = 10 ** st.dec;
  const rules = { stake: R("stake").checked, min: Number(R("min").value) || 0, top: Math.max(0, Math.floor(Number(R("top").value) || 0)), skip: new Set(R("skip").value.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean)), before: etMidnight(R("before").value), nosell: etMidnight(R("nosell").value) };
  const left = { skip: 0, min: 0, before: 0, nosell: 0, top: 0 };
  const { total, g } = st.groups;

  let rows = [];
  for (const h of s.holders) {
    if (!st.on[h.group]) continue;
    if (rules.skip.has(h.addr) || (h.stake && rules.skip.has(h.stake))) { left.skip++; continue; }
    const q = Number(h.qty);
    // Curve, pool and contract addresses stay as their own rows even when grouping by wallet.
    const solo = h.group !== "wallet" && h.group !== "dev";
    rows.push({ key: rules.stake && h.stake && !solo ? h.stake : h.addr, addr: h.addr, stake: h.stake, qty: q, addrs: [h.addr], group: h.group, groups: new Set([h.group]), lockedUntilMs: h.lockedUntilMs || 0, name: h.name || null, venue: h.venue || null, lockSchedule: h.lockSchedule, lockDatesVerified: h.lockDatesVerified });
  }
  if (rules.stake) {
    const m = new Map();
    for (const r of rows) {
      const x = m.get(r.key);
      if (x) { x.qty += r.qty; x.addrs.push(r.addr); x.groups.add(r.group); if (r.qty > x.top) { x.top = r.qty; x.addr = r.addr; x.group = r.group; } }
      else m.set(r.key, { ...r, top: r.qty });
    }
    rows = [...m.values()];
    // A wallet that also owns a creator-labelled address is the creator.
    for (const r of rows) if (r.groups.has("dev")) r.group = "dev";
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
        if (rules.before && !has(early)) { left.before++; return false; }
        if (rules.nosell && has(sold)) { left.nosell++; return false; }
        return true;
      });
      if (st.trades.capped) notice("<strong>Long trade history.</strong> Only the most recent 5,000 trades were read, so the oldest buys may be missing.");
    }
  }
  if (run !== st.busy) return;

  rows = rows.filter((r) => { if (r.qty / div < rules.min) { left.min++; return false; } return true; });
  rows.sort((a, b) => b.qty - a.qty);
  if (rules.top && rows.length > rules.top) { left.top = rows.length - rules.top; rows = rows.slice(0, rules.top); }

  const kept = rows.reduce((a, r) => a + r.qty, 0);
  rows.forEach((r) => (r.share = kept ? (r.qty / kept) * 100 : 0));
  st.out = rows;

  const onNames = Object.keys(GROUPS).filter((k) => st.on[k] && g[k].n).map((k) => (k === "solada" ? GROUPS[k].name : GROUPS[k].name.toLowerCase()));
  const top10 = rows.slice(0, 10).reduce((a, r) => a + r.share, 0);
  const onlyWallets = onNames.length === 1 && onNames[0] === "wallets";
  $("[data-kpis]").innerHTML = [
    [onlyWallets && rules.stake ? "Wallets in the list" : "Rows in the list", fmt(rows.length), onlyWallets ? "wallets only" : "includes " + onNames.join(", ")],
    ["Tokens they hold", amt(kept / div), total ? pct((kept / total) * 100) + " of supply" : ""],
    ["Largest balance", rows.length ? pct(rows[0].share) : "–", "of the list"],
    ["Top 10 hold", rows.length ? pct(top10) : "–", "of the list"]
  ].map(([l, v, sub]) => `<div class="kpi"><span class="kpi-label">${esc(l)}</span><span class="kpi-value">${esc(v)}</span>${sub ? `<span class="kpi-sub">${esc(sub)}</span>` : ""}</div>`).join("");

  const names = { skip: "on your skip list", min: "under the minimum", before: "didn't buy before the date", nosell: "sold since the date", top: "outside the top " + rules.top };
  const bits = Object.entries(left).filter(([, n]) => n).map(([k, n]) => `${fmt(n)} ${names[k]}`);
  $("[data-left]").textContent = bits.length ? "Rules left out " + bits.join(", ") + "." : "";

  renderRows();
  $("[data-csv]").disabled = $("[data-copy]").disabled = !rows.length;
}

function typeCell(r) {
  if (r.group === "wallet") return r.addrs.length > 1 ? `<span class="cell-sub">${r.addrs.length} addresses</span>` : "";
  const G = GROUPS[r.group];
  let extra = "";
  if (r.group === "locked" && r.lockedUntilMs) extra = `until ${dateET(r.lockedUntilMs)}`;
  else if (r.group === "pool") extra = r.venue || (st.snap.coin.src === "snek" ? "Venue not identified" : "Minswap");
  else if (r.group === "lockcontract") extra = lockExplanation([r]);
  else if (r.group === "burn") extra = "$burnsnek";
  else if (r.group === "solada") return `<span class="gtag" style="--c:${G.color}"><i></i>${esc(r.name || G.name)}</span><span class="cell-sub">Solada's own wallet · proof of reserves</span>`;
  else if (r.addrs.length > 1) extra = `${r.addrs.length} addresses`;
  return `<span class="gtag" style="--c:${G.color}"><i></i>${esc(G.name)}</span>${extra ? `<span class="cell-sub">${esc(extra)}</span>` : ""}`;
}

function renderRows() {
  const div = 10 ** st.dec;
  const shown = st.more ? st.out : st.out.slice(0, 100);
  const grouped = R("stake").checked;
  const max = st.out.length ? st.out[0].share : 0;
  $("[data-rows]").innerHTML = shown.length ? shown.map((r, i) => {
    const id = r.stake && grouped && r.group === "wallet" ? r.stake : r.addr;
    const href = "https://cardanoscan.io/" + (id.startsWith("stake1") ? "stakekey/" : "address/") + esc(id);
    return `<tr class="${r.group !== "wallet" ? "is-" + r.group : ""}">
    <td class="num">${i + 1}</td>
    <td><span class="wal"><span class="mono" title="${esc(id)}">${esc(short(id))}</span><a class="wal-link" href="${href}" target="_blank" rel="noopener" title="Open on Cardanoscan">Cardanoscan ↗</a></span></td>
    <td>${typeCell(r)}</td>
    <td class="num">${fmt(r.qty / div, 2)}</td>
    <td class="num"><span class="share-num">${r.share.toFixed(r.share < 0.1 ? 3 : 2)}%</span><span class="bar" style="--w:${max ? ((r.share / max) * 100).toFixed(1) : 0}%"></span></td>
  </tr>`; }).join("") : `<tr><td colspan="5"><div class="empty"><p>No holders match these rules.</p></div></td></tr>`;
  $("[data-more]").hidden = st.more || st.out.length <= 100;
  $("[data-more]").textContent = `Show all ${fmt(st.out.length)}`;
}

function csv() {
  const div = 10 ** st.dec;
  const c = st.snap.coin;
  const lines = ["rank,address,stake_address,balance,share_pct,addresses,type,venue,contract_name,lock_dates_verified"];
  const cell = (x) => '"' + String(x ?? "").replace(/"/g, '""') + '"';
  st.out.forEach((r, i) => lines.push([i + 1, r.addr, r.stake || "", (r.qty / div).toFixed(st.dec), r.share.toFixed(6), r.addrs.length, r.group, r.venue, r.name, r.group === "lockcontract" ? !!r.lockDatesVerified : ""].map(cell).join(",")));
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

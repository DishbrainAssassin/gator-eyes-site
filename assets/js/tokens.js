// Tokens table: every coin on Solada.fun with windowed volume, net flow,
// price change, graduation progress and each coin's Gator Eyes alerts.
import { getApi, price, pct, signed, hours, age } from "./api.js?v=20261029f";
import { coinUrl } from "./data.js?v=20261029f";
import { esc, fmt, compact, usdcx, timeAgo } from "./ui.js?v=20261029f";
import { wireLinks, liveStatus } from "./common.js?v=20261029f";

wireLinks();
const $ = (s) => document.querySelector(s);
const rowsEl = $("[data-rows]"), moreBtn = $("[data-more]"), notice = $("[data-notice]");
const AL = { big: ["Whale", "var(--color-amber)"], spike: ["Spike", "var(--color-spike)"], launch: ["Fast launch", "var(--color-launch)"], dev: ["Creator sell", "var(--color-sell)"] };
const params = new URLSearchParams(location.search);
const st = { win: params.get("w") || "h24", sort: "v", dir: -1, f: "all", q: "", quiet: false, all: false, data: null };

function val(c, k) {
  const w = c.w[st.win] || {};
  switch (k) {
    case "price": return c.price ?? -1;
    case "ch": return w.ch ?? -1e9;
    case "v": return w.v || 0;
    case "n": return w.n || 0;
    case "net": return w.net || 0;
    case "mc": return c.mc || 0;
    case "prog": return c.cs === "open" ? c.prog || 0 : c.cs === "graduated" ? 10001 : -1;
    case "al": return Object.values(c.al || {}).reduce((a, b) => a + b, 0);
  }
  return 0;
}

function curveCell(c) {
  if (c.cs === "open") {
    const p = Math.min(100, (c.prog || 0) / 100);
    const eta = c.pace && c.pace.etaH != null ? hours(c.pace.etaH) + " to go" : "not moving closer";
    return `<span class="prog" title="${p.toFixed(1)}% of the way to graduating"><i style="--p:${p}%"></i></span><span class="cell-sub">${p.toFixed(0)}% · ${esc(eta)}</span>`;
  }
  if (c.cs === "graduated") return `<span class="prog is-done"><i style="--p:100%"></i></span><span class="cell-sub">Graduated</span>`;
  if (c.kind === "pump") return `<span class="cell-sub">Pump.fun</span>`;
  if (c.id === "SOLADA") return `<span class="cell-sub">Minswap</span>`;
  return `<span class="cell-sub">–</span>`;
}

function alertsCell(c) {
  const al = c.al || {};
  const bits = Object.entries(AL).filter(([k]) => al[k]).map(([k, [label, color]]) => `<a class="al-dot" style="--k:${color}" href="./followup.html?coin=${encodeURIComponent(c.tk || c.id)}" title="${al[k]} ${label} alert${al[k] > 1 ? "s" : ""} in the last 24 hours">${al[k]}</a>`);
  return bits.length ? `<span class="al-dots">${bits.join("")}</span>` : `<span class="cell-sub">–</span>`;
}

function row(c) {
  const w = c.w[st.win] || { v: 0, n: 0, b: 0, s: 0, net: 0, wal: 0, ch: null };
  const tot = (w.b || 0) + (w.s || 0);
  const bp = tot ? Math.round((w.b / tot) * 100) : 50;
  const img = c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy" width="28" height="28">` : `<span class="coin-dot"></span>`;
  return `<tr>
    <td><div class="coin-cell">${img}<div><a href="${esc(coinUrl(c.id))}" target="_blank" rel="noopener">${esc(c.tk || "?")}</a><span class="cell-sub">${esc((c.name || "").slice(0, 22))}${c.born ? " · " + esc(age(c.born)) : ""}</span></div></div></td>
    <td class="num">${price(c.price)}</td>
    <td class="num ${w.ch > 0 ? "pos" : w.ch < 0 ? "neg" : ""}">${pct(w.ch)}</td>
    <td class="num">${fmt(w.v)}<span class="cell-sub">${esc(usdcx(w.v, st.data.adaUsd))}</span></td>
    <td class="num hide-sm">${fmt(w.n)}<span class="cell-sub">${fmt(w.wal)} wallets</span></td>
    <td class="num split-col"><span class="${w.net > 0 ? "pos" : w.net < 0 ? "neg" : ""}">${signed(w.net)}</span><span class="rowsplit" title="${fmt(w.b)} ADA bought, ${fmt(w.s)} ADA sold"><span class="split-buy" style="width:${bp}%"></span></span></td>
    <td class="num hide-sm">${compact(c.mc)}</td>
    <td class="hide-sm curve-cell">${curveCell(c)}</td>
    <td class="num">${alertsCell(c)}</td>
    <td class="hide-sm"><a class="icon-btn" href="./coincard.html?coin=${encodeURIComponent(c.id)}" title="Make a share card for ${esc(c.tk || "")}">Card</a></td>
  </tr>`;
}

function render() {
  if (!st.data) return;
  const q = st.q.toLowerCase();
  let list = st.data.coins.filter((c) => {
    if (q && !((c.tk || "").toLowerCase().includes(q) || (c.name || "").toLowerCase().includes(q) || c.id.toLowerCase() === q)) return false;
    if (st.f === "curve" && c.cs !== "open") return false;
    if (st.f === "grad" && c.cs !== "graduated") return false;
    if (st.f === "alerts" && !Object.keys(c.al || {}).length) return false;
    if (!st.quiet && !q && !(c.w[st.win] && c.w[st.win].n)) return false;
    return true;
  });
  list.sort((a, b) => (val(a, st.sort) - val(b, st.sort)) * st.dir || (val(b, "v") - val(a, "v")));
  const shown = st.all ? list : list.slice(0, 50);
  rowsEl.innerHTML = shown.length ? shown.map(row).join("") : `<tr><td colspan="10"><div class="empty"><p>${st.win === "live" ? "No trades in the last 15 minutes." : "No coins match."} Try a longer window or include quiet coins.</p></div></td></tr>`;
  moreBtn.hidden = st.all || list.length <= 50;
  moreBtn.textContent = `Show all ${list.length} coins`;
  $("[data-updated]").textContent = st.data.updatedAt ? "Updated " + timeAgo(Date.parse(st.data.updatedAt)) + "." : "";
}

document.querySelectorAll("[data-win]").forEach((b) => {
  b.classList.toggle("is-on", b.dataset.win === st.win);
  b.addEventListener("click", () => {
    st.win = b.dataset.win;
    document.querySelectorAll("[data-win]").forEach((x) => { x.classList.toggle("is-on", x === b); x.setAttribute("aria-selected", x === b); });
    render();
  });
});
document.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => {
  st.f = b.dataset.f;
  document.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("is-on", x === b));
  render();
}));
document.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => {
  if (st.sort === b.dataset.sort) st.dir *= -1; else { st.sort = b.dataset.sort; st.dir = -1; }
  document.querySelectorAll("[data-sort]").forEach((x) => x.classList.toggle("is-on", x === b));
  render();
}));
$("[data-search]").addEventListener("input", (e) => { st.q = e.target.value.trim(); render(); });
$("[data-quiet]").addEventListener("change", (e) => { st.quiet = e.target.checked; render(); });
moreBtn.addEventListener("click", () => { st.all = true; render(); });

rowsEl.innerHTML = Array.from({ length: 8 }, () => `<tr><td colspan="10"><div class="skel-block" style="min-height:36px"></div></td></tr>`).join("");

async function load() {
  try {
    const j = await getApi("/tokens");
    st.data = j;
    notice.hidden = true;
    liveStatus({ updatedAt: new Date(j.updatedAt) });
    render();
  } catch (e) {
    liveStatus(null, e);
    if (!st.data) {
      notice.hidden = false;
      notice.innerHTML = "<strong>Can't reach the Gator Eyes feed right now.</strong> It will retry in a minute.";
      rowsEl.innerHTML = "";
    }
  }
}
load();
setInterval(load, 60000);

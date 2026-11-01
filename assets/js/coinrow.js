// One table row for a coin from /tokens. Shared by the Tokens page and the Watchlist
// so both show the same numbers the same way.
import { price, pct, signed, hours, age } from "./api.js?v=20261101-clean2";
import { coinUrl } from "./data.js?v=20261101-clean2";
import { esc, fmt, compact, usdcx } from "./ui.js?v=20261101-clean2";
import { pill } from "./platform.js?v=20261101-clean2";
import { starBtn } from "./watchlist.js?v=20261101-clean2";

export const AL = { big: ["Whale", "var(--color-amber)"], spike: ["Spike", "var(--color-spike)"], launch: ["Fast launch", "var(--color-launch)"], dev: ["Creator sell", "var(--color-sell)"] };

export function curveCell(c) {
  if (c.src === "snek") {
    if (c.cs === "graduated") return `<span class="prog is-done lp-snek"><i style="--p:100%"></i></span><span class="cell-sub">Splash pool</span>`;
    if (c.cs === "open" && c.prog != null) {
      const p = Math.min(100, (c.prog || 0) / 100);
      return `<span class="prog lp-snek" title="${p.toFixed(1)}% of the way to graduating"><i style="--p:${p}%"></i></span><span class="cell-sub">${p.toFixed(0)}% · Snek.fun curve</span>`;
    }
    return `<span class="cell-sub">Snek.fun curve</span>`;
  }
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

export function alertsCell(c) {
  const al = c.al || {};
  const bits = Object.entries(AL).filter(([k]) => al[k]).map(([k, [label, color]]) => `<a class="al-dot" style="--k:${color}" href="./followup.html?coin=${encodeURIComponent(c.tk || c.id)}" title="${al[k]} ${label} alert${al[k] > 1 ? "s" : ""} in the last 24 hours">${al[k]}</a>`);
  return bits.length ? `<span class="al-dots">${bits.join("")}</span>` : `<span class="cell-sub">–</span>`;
}

/** Links for the last column: card (Solada) or Snek.fun page on Tokens; Follow-up and Holders on the Watchlist. */
export function actionsCell(c, { more = false } = {}) {
  const a = [];
  if (more) {
    a.push(`<a class="icon-btn" href="./followup.html?coin=${encodeURIComponent(c.tk || c.id)}" title="Follow-up on ${esc(c.tk || "")} alerts">Follow-up</a>`);
    a.push(`<a class="icon-btn" href="./holders.html?coin=${encodeURIComponent(c.tk || c.id)}" title="Holder snapshot for ${esc(c.tk || "")}">Holders</a>`);
  }
  // The ticker already opens the coin's own page, so the Watchlist (more=true) stops at Follow-up and Holders.
  if (more) return `<span class="row-actions">${a.join("")}</span>`;
  if (c.src === "snek") a.push(`<a class="icon-btn" href="${esc(coinUrl(c.id))}" target="_blank" rel="noopener" title="Open ${esc(c.tk || "")} on Snek.fun">Snek.fun</a>`);
  else a.push(`<a class="icon-btn" href="./coincard.html?coin=${encodeURIComponent(c.id)}" title="Make a share card for ${esc(c.tk || "")}">Card</a>`);
  return `<span class="row-actions">${a.join("")}</span>`;
}

/**
 * Full row. opts: win (live|h1|h6|h24), rate (ADA→USDCx), showPill (tag Snek.fun coins),
 * star (show the watchlist star), more (Follow-up/Holders links too).
 */
export function coinRow(c, { win = "h24", rate = null, showPill = true, star = true, more = false } = {}) {
  const w = (c.w && c.w[win]) || { v: 0, n: 0, b: 0, s: 0, net: 0, wal: 0, ch: null };
  const tot = (w.b || 0) + (w.s || 0);
  const bp = tot ? Math.round((w.b / tot) * 100) : 50;
  const img = c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy" width="28" height="28">` : `<span class="coin-dot"></span>`;
  return `<tr data-id="${esc(c.id)}">
    ${star ? `<td class="star-col">${starBtn(c)}</td>` : ""}
    <td><div class="coin-cell">${img}<div><a href="${esc(coinUrl(c.id))}" target="_blank" rel="noopener">${esc(c.tk || "?")}</a>${showPill && c.src === "snek" ? pill("snek") : ""}<span class="cell-sub">${esc((c.name || "").slice(0, 22))}${c.born ? " · " + esc(age(c.born)) : ""}</span></div></div></td>
    <td class="num">${price(c.price)}</td>
    <td class="num ${w.ch > 0 ? "pos" : w.ch < 0 ? "neg" : ""}">${pct(w.ch)}</td>
    <td class="num">${fmt(w.v)}<span class="cell-sub">${esc(usdcx(w.v, rate))}</span></td>
    <td class="num hide-sm">${fmt(w.n)}<span class="cell-sub">${fmt(w.wal)} wallets</span></td>
    <td class="num split-col"><span class="${w.net > 0 ? "pos" : w.net < 0 ? "neg" : ""}">${signed(w.net)}</span><span class="rowsplit" title="${fmt(w.b)} ADA bought, ${fmt(w.s)} ADA sold"><span class="split-buy" style="width:${bp}%"></span></span></td>
    <td class="num hide-sm">${compact(c.mc)}</td>
    <td class="hide-sm curve-cell">${curveCell(c)}</td>
    <td class="num">${alertsCell(c)}</td>
    <td class="hide-sm">${actionsCell(c, { more })}</td>
  </tr>`;
}

/** Row for a saved coin that isn't in the live list any more. */
export function missingRow(x, { star = true } = {}) {
  const img = x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy" width="28" height="28">` : `<span class="coin-dot"></span>`;
  return `<tr data-id="${esc(x.id)}" class="is-missing">
    ${star ? `<td class="star-col">${starBtn(x)}</td>` : ""}
    <td><div class="coin-cell">${img}<div><a href="${esc(coinUrl(x.id))}" target="_blank" rel="noopener">${esc(x.tk || "?")}</a>${x.src === "snek" ? pill("snek") : ""}<span class="cell-sub">${esc((x.name || "").slice(0, 22))}</span></div></div></td>
    <td colspan="8"><span class="cell-sub">Not in the live coin list right now. The gator only tracks coins ${x.src === "snek" ? "Snek.fun" : "Solada.fun"} is still listing; the link still opens its page.</span></td>
    <td class="hide-sm"></td>
  </tr>`;
}

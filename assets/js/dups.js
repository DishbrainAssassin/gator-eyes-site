// Shared tickers: when more than one coin uses the same ticker on Solada or Snek.fun, show every copy with
// plain facts (launchpad, graduated or not, holders, age, policy ID, same or different creator wallet).
// Gator Eyes doesn't pick the "real" one; the policy ID is what to check against the project's own links.
import { getApi } from "./api.js?v=20261102-usdcx2";
import { coinUrl } from "./data.js?v=20261102-usdcx2";
import { esc, fmt, compact } from "./ui.js?v=20261102-usdcx2";

let cache = null;
export function loadDups() {
  if (!cache) cache = getApi("/dups").catch(() => null);
  return cache;
}
const ageTxt = (ms) => {
  if (!ms) return "–";
  const d = Math.floor((Date.now() - ms) / 864e5);
  return d < 1 ? "today" : d === 1 ? "1 day old" : fmt(d) + " days old";
};
const pol = (p) => (p ? p.slice(0, 8) + "…" + p.slice(-4) : "–");

/** The copies of a ticker, or null when only one coin uses it. */
export function copiesOf(d, tk) {
  if (!d || !tk) return null;
  const rows = d.tickers && d.tickers[String(tk).toUpperCase().trim()];
  return rows && rows.length > 1 ? rows : null;
}

/** A collapsed "Ticker shared" tag. Opens to a small table of every coin using the ticker; `id` is marked "this one". */
export function dupTag(d, tk, id) {
  const rows = copiesOf(d, tk);
  if (!rows) return "";
  const others = rows.length - 1;
  const body = rows.map((r) => {
    const me = r.id === id || r.slug === id;
    const href = coinUrl(r.src === "snek" ? r.id : r.slug || r.id);
    return `<tr${me ? ` class="is-me"` : ""}>
      <td><a href="${esc(href)}" target="_blank" rel="noopener">$${esc(r.tk || "?")}</a>${me ? ` <small class="dup-me">this one</small>` : ""}<small class="cell-sub">${r.src === "snek" ? "Snek.fun" : "Solada"}${r.name && r.name.toUpperCase() !== String(r.tk || "").toUpperCase() ? " · " + esc(r.name) : ""}</small></td>
      <td>${r.grad ? "Graduated" : "On the curve"}</td>
      <td class="num">${r.hold != null ? fmt(r.hold) : "–"}</td>
      <td class="num hide-sm">${r.mc != null ? compact(r.mc) + " ADA" : "–"}</td>
      <td class="hide-sm">${esc(ageTxt(r.born))}</td>
      <td><code title="${esc(r.policy || "")}">${esc(pol(r.policy))}</code>${r.cr ? `<small class="cell-sub">creator ${esc(r.cr)}</small>` : ""}</td>
    </tr>`;
  }).join("");
  const creators = new Set(rows.filter((r) => r.cr).map((r) => r.cr)).size;
  return `<details class="dup-tag">
    <summary title="More than one coin uses this ticker"><span class="dup-long">Ticker shared with ${fmt(others)} other coin${others === 1 ? "" : "s"}</span><span class="dup-short">Shared ticker ×${fmt(rows.length)}</span></summary>
    <div class="dup-pop">
      <p>${rows.length} coins use $${esc(String(tk).toUpperCase())}${creators > 1 ? `, launched from ${creators} different creator wallets` : ""}. Match the policy ID with the one the project posts on its own site or socials to be sure which coin you're looking at. Gator Eyes doesn't say which one is real.</p>
      <div class="table-wrap"><table class="coin-table dup-table"><thead><tr><th scope="col">Coin</th><th scope="col">Stage</th><th scope="col" class="num">Holders</th><th scope="col" class="num hide-sm">Market cap</th><th scope="col" class="hide-sm">Age</th><th scope="col">Policy ID</th></tr></thead><tbody>${body}</tbody></table></div>
      <p class="cell-sub">Same letter = same creator wallet (Solada coins). Snek.fun creators aren't compared. Holder counts are Solada's; Snek.fun doesn't publish one.</p>
    </div>
  </details>`;
}

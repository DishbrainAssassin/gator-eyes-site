// Worker API for the tools pages (tokens, race, follow-up, holders, coin cards).
// ?api=<url> points a page at another copy of the worker for testing.
import { CONFIG } from "./config.js?v=20261101-clean1";

export const API = (new URLSearchParams(location.search).get("api") || CONFIG.feedUrl.replace(/\/feed$/, "")).replace(/\/$/, "");

export async function getApi(path, params = {}) {
  const u = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (k !== "_retried" && v != null && v !== "") u.searchParams.set(k, v);
  let r = await fetch(u, { cache: "no-store" });
  let j = null;
  try { j = await r.json(); } catch {}
  if (r.status === 429 && !params._retried) {
    // Busy: wait as long as the worker asks (up to 30 s), then try once more.
    await new Promise((ok) => setTimeout(ok, Math.min(30, (j && j.retryAfter) || 20) * 1000));
    return getApi(path, { ...params, _retried: 1 });
  }
  if (!r.ok) throw new Error((j && j.error) || "HTTP " + r.status);
  return j;
}

/** Prices on Solada run to many decimals. 0.0000261 becomes 0.0₄261. */
export function price(p) {
  if (p == null || !isFinite(p)) return "–";
  if (p >= 1) return p.toLocaleString("en-US", { maximumFractionDigits: 3 });
  if (p >= 0.001) return p.toLocaleString("en-US", { maximumSignificantDigits: 4 });
  const s = p.toExponential(3);
  const [m, e] = s.split("e-");
  const zeros = Number(e) - 1;
  const digits = m.replace(".", "").replace(/0+$/, "") || "0";
  const sub = String(zeros).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[d]).join("");
  return "0.0" + sub + digits;
}

export function pct(n, d = 1) {
  if (n == null || !isFinite(n)) return "–";
  const v = Math.abs(n) >= 1000 ? Math.round(n).toLocaleString("en-US") : n.toFixed(d);
  return (n > 0 ? "+" : n < 0 ? "−" : "") + v.replace("-", "") + "%";
}

export function signed(n) {
  if (n == null || !isFinite(n)) return "–";
  return (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(Math.round(n)).toLocaleString("en-US");
}

export function hours(h) {
  if (h == null) return "–";
  if (h < 1) return "under an hour";
  if (h < 36) return "about " + Math.round(h) + (Math.round(h) === 1 ? " hour" : " hours");
  const d = Math.round(h / 24);
  return "about " + d + (d === 1 ? " day" : " days");
}

export function span(ms) {
  if (ms == null || ms < 0) return "–";
  const m = Math.round(ms / 60000);
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 48) return h + "h " + (m % 60) + "m";
  return Math.round(h / 24) + " days";
}

export function age(ms) {
  if (!ms) return "";
  return span(Date.now() - ms) + " old";
}

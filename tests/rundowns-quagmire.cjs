// Ask Quagmire on the website: Gator Run Downs answers with the Paddock link, the racing-coin line, and the
// Gator Eyes Race page (graduation) left alone. The worker's /tokens and /rundowns are mocked; no network.
const assert = require("node:assert/strict");
const path = require("node:path");
const now = Date.now();
let rd = null, rdFail = false;
const el = () => ({ addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, setAttribute() {}, classList: { toggle() {}, add() {}, remove() {} }, style: {}, dataset: {} });
globalThis.document = { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], documentElement: el(), body: el(), createElement: el };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.location = { search: "", href: "https://www.gatoreyes.fun/", pathname: "/" };
globalThis.fetch = async (u) => {
  u = String(u);
  if (u.includes("/rundowns")) return rdFail ? new Response("{}", { status: 502 }) : Response.json(rd);
  if (u.includes("/tokens")) return Response.json({ adaUsd: null, coins: [
    { id: "draft-mepe", tk: "MEPE", name: "Mepe", kind: "curve", cs: "open", prog: 1200, pace: {}, born: now - 3e5, w: { h24: { v: 300, n: 6, net: 210, wal: 5 } }, al: {} },
    { id: "draft-oldy", tk: "OLDY", kind: "curve", cs: "open", prog: 400, pace: {}, born: now - 9e6, w: { h24: { v: 10, n: 1, net: 10, wal: 1 } }, al: {} }] });
  throw new Error("Unexpected network request: " + u);
};
const base = { v: 1, play: "https://gatorrundowns.fun/paddock.html", last: { ticker: "PREV", lunge: true } };
(async () => {
  const m = await import(path.join(__dirname, "../assets/js/gator.js"));
  rd = { ...base, open: [{ coinId: "draft-mepe", ticker: "MEPE", closesAt: now + 27e4, called: false, buyers: 5, net: 210 }] };
  let h = await m.answer("is there a race up?");
  assert.match(h, /One race is open for picks right now/);
  assert.match(h, /href="https:\/\/gatorrundowns\.fun\/paddock\.html" target="_blank" rel="noopener">Pick at Gator Run Downs/);
  h = await m.answer("$MEPE");
  assert.match(h, /It's racing in Gator Run Downs right now/);
  assert.doesNotMatch(await m.answer("$OLDY"), /Run Downs/);
  assert.match(await m.answer("how do I play gator run downs"), /^Gator Run Downs is a free pick game[\s\S]*Open right now/);
  assert.match(await m.answer("Any Run Downs races open?"), /open for picks right now/);
  // Graduation "race" questions are still Gator Eyes.
  assert.match(await m.answer("what's close to graduating"), /Closest to graduating/);
  assert.doesNotMatch(await m.answer("race page"), /Run Downs/);
  assert.equal(m.RD_RE.test(" what's the race "), false);
  // Topics.
  assert.equal(m.rdTopic(" are there prizes in run downs "), "prize");
  assert.equal(m.rdTopic(" any races up "), "live");
  assert.equal(m.rdTopic(" what is lunge or no lunge "), "target");
  console.log("PASS: Run Downs answers, Paddock links, racing-coin line, graduation Race page unchanged.");
})().catch((e) => { console.error(e); process.exit(1); });

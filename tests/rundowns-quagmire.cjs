// Ask Quagmire on the website asks the worker (POST /quag), the same brain as Discord /ask. Checks the request,
// that Gator Eyes links stay on the current host, and the offline reply. Network is mocked.
// (Run Downs, unlock and every other answer is tested in gator-eyes-worker.)
const assert = require("node:assert/strict");
const path = require("node:path");
const el = () => ({ addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, setAttribute() {}, classList: { toggle() {}, add() {}, remove() {} }, style: {}, dataset: {} });
globalThis.document = { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], documentElement: el(), body: el(), createElement: el };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.location = { search: "", href: "https://www.gatoreyes.fun/tokens.html", pathname: "/tokens.html" };
let sent = [], down = false;
globalThis.fetch = async (u, o) => {
  u = String(u);
  if (u.endsWith("/quag")) {
    if (down) throw new Error("offline");
    const b = JSON.parse(o.body); sent.push({ method: o.method, b });
    return Response.json({ html: `Answer to ${b.q}: <a href="https://www.gatoreyes.fun/unlocks.html">Unlock calendar</a> · <a href="https://gatorrundowns.fun/paddock.html" target="_blank" rel="noopener">Paddock</a>`, fb: false });
  }
  throw new Error("Unexpected network request: " + u);
};
(async () => {
  const m = await import(path.join(__dirname, "../assets/js/gator.js"));
  let h = await m.answerFollowUp("what unlocks are coming up", "$GAEY");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, "POST");
  assert.deepEqual(sent[0].b, { q: "what unlocks are coming up", prev: "$GAEY", pg: "/tokens.html" });
  assert.match(h, /^Answer to what unlocks are coming up/);
  assert.match(h, /href="\.\/unlocks\.html"/);
  assert.match(h, /href="https:\/\/gatorrundowns\.fun\/paddock\.html" target="_blank"/);
  h = await m.answer("hi");
  assert.equal(sent[1].b.prev, "");
  down = true;
  assert.match(await m.answer("anything"), /can't reach my notes right now/);
  console.log("PASS: website chat asks the worker's /quag, keeps site links local, and handles offline.");
})().catch((e) => { console.error(e); process.exit(1); });

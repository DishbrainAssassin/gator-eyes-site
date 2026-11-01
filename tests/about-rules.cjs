const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const js = fs.readFileSync(path.join(__dirname, "../assets/js/about.js"), "utf8");
const render = js.slice(js.indexOf("const hour ="), js.indexOf("// Embed code"));
const result = { innerHTML: "" };
const sandbox = {
  $: () => result,
  esc: (s) => String(s),
  fmt: (n, d = 0) => Number(n).toLocaleString("en-US", { maximumFractionDigits: d }),
};
vm.createContext(sandbox);
vm.runInContext(render, sandbox);
sandbox.renderRules({ bigUsd: 1000, bigAda: 5000, mcapPct: 7.5, mcapMinAda: 250, creatorMinAda: 500, creatorMcapPct: 5, recapHourET: 0, recapMinET: 1 });
assert.equal((result.innerHTML.match(/7\.5%/g) || []).length, 2);
assert.ok(!result.innerHTML.includes("8%"));
assert.ok(result.innerHTML.includes("12:01 AM"));
assert.ok(result.innerHTML.includes("does not apply to Splash trades"));
console.log("PASS: fractional whale thresholds, recap time, and Splash exception.");

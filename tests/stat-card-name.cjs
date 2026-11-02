const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
for (const file of fs.readdirSync(root).filter(f => f.endsWith(".html"))) {
  const text = fs.readFileSync(path.join(root,file), "utf8");
  assert.doesNotMatch(text, /(?:coin )?share cards?/i, file);
  if (text.includes('href="./coincard.html"')) assert.match(text, />Stat card<\/a>/, file);
}
const helper = fs.readFileSync(path.join(root,"assets/js/gator.js"), "utf8");
assert.match(helper, /stat card\|share card\|coin card/);
assert.match(helper, /"stat card", "share card", "coin card"/);
assert.match(helper, /Here's the stat card/);
assert.match(helper, /"Stat card"/);
assert.match(fs.readFileSync(path.join(root,"coincard.html"),"utf8"), /aria-label="Stat card"/);
console.log("PASS: Stat card labels across all HTML pages and helper aliases.");

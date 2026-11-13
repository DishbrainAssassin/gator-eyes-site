const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "tools.html"), "utf8");
const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
const groupIds = ["explore", "research", "track", "create", "help"];
for (const id of groupIds) {
  assert(html.includes(`id="${id}"`), `Missing category: ${id}`);
  assert(html.includes(`href="#${id}"`), `Missing category shortcut: ${id}`);
}
const tools = [...html.matchAll(/<(a|button)\b[^>]*class="directory-tool(?: [^"]*)?"[^>]*>/g)];
assert.equal(tools.length, 23, "Keep the displayed tool count accurate");
for (const [tag] of tools) {
  const href = tag.match(/href="([^"]+)"/)?.[1];
  if (!href?.startsWith("./")) continue;
  const [file, hash] = href.slice(2).split("#");
  assert(fs.existsSync(path.join(root, file)), `Missing destination: ${href}`);
  if (hash) assert(fs.readFileSync(path.join(root, file), "utf8").includes(`id="${hash}"`), `Missing anchor: ${href}`);
}
const create = html.split('id="create"')[1].split("</section>")[0];
assert(create.includes("Add Quagmire to your Discord"));
const invite = new URL(create.match(/href="(https:\/\/discord.com\/oauth2\/authorize[^"]+)"/)[1].replaceAll("&amp;", "&"));
assert.equal(invite.searchParams.get("client_id"), "1565927118242578442");
assert.equal(invite.searchParams.get("permissions"), "0");
assert.equal(invite.searchParams.get("scope"), "bot applications.commands");
assert(html.split('id="help"')[1].includes("data-ask"), "Website chat remains under Get help");
assert(home.includes('class="browse-tools-link btn" href="./tools.html"'), "Homepage needs a visible directory entry");
for (const file of fs.readdirSync(root).filter(f => f.endsWith(".html"))) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  if (!content.includes('class="tools-dropdown"')) continue;
  assert(/class="tools-dropdown">\s*<a class="all-tools-link"/.test(content), `All tools must be first: ${file}`);
}
console.log("PASS: five categories, 23 tools, local destinations, Discord setup, website chat, homepage entry and All tools ordering.");

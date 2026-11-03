import { wireLinks } from "./common.js?v=20261102-usdcx2";
wireLinks();

const search = document.querySelector("#tool-search");
// In the installed phone app, drop tools that suit a desktop better.
const inApp = (() => {
  if (matchMedia("(display-mode: standalone)").matches || navigator.standalone === true) return true;
  try { return new URLSearchParams(location.search).get("source") === "app" || sessionStorage.getItem("ge-app-mode") === "1"; } catch { return false; }
})();
if (inApp) document.querySelectorAll("[data-app-hide]").forEach((el) => el.remove());
const groups = [...document.querySelectorAll(".directory-category")];
const items = [...document.querySelectorAll(".directory-tool")];
const count = document.querySelector("[data-tool-count]");
const empty = document.querySelector("[data-directory-empty]");
const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function filterTools() {
  const words = normalize(search.value).split(" ").filter(Boolean).map(word =>
    word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word
  );
  for (const item of items) {
    const text = normalize(item.textContent + " " + item.closest(".directory-category").querySelector("h2").textContent);
    item.hidden = !words.every(word => text.includes(word));
  }
  for (const group of groups) group.hidden = !group.querySelector(".directory-tool:not([hidden])");
  const visible = items.filter(item => !item.hidden).length;
  count.textContent = words.length ? `${visible} of ${items.length} tools & destinations` : `${items.length} tools & destinations`;
  empty.hidden = visible !== 0;
}
document.querySelector("[data-directory-search]").hidden = false;
if (inApp) count.textContent = `${items.length} tools & destinations`;
search.addEventListener("input", filterTools);
document.querySelector("[data-directory-reset]").addEventListener("click", () => {
  search.value = "";
  filterTools();
  search.focus();
});
// Category links always reveal their destination, even after a search.
document.querySelectorAll(".directory-jumps a").forEach(link => link.addEventListener("click", () => {
  search.value = "";
  filterTools();
}));
filterTools();

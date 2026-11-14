// Chrome extension page: shared header, menu and links, plus click-to-enlarge screenshots.
import { wireLinks } from "./common.js?v=20261113-toolsmenu";
wireLinks();

function wireZoom() {
  const imgs = document.querySelectorAll(".ext-shot img, .ext-feature img");
  if (!imgs.length) return;
  const dlg = document.createElement("dialog");
  dlg.className = "ext-lightbox";
  dlg.setAttribute("aria-label", "Enlarged screenshot");
  dlg.innerHTML = '<button type="button" class="ext-lightbox-close">Close ✕</button>' +
    '<div class="ext-lightbox-inner"><img alt=""><p class="ext-lightbox-cap"></p></div>';
  document.body.appendChild(dlg);
  const big = dlg.querySelector("img");
  const cap = dlg.querySelector(".ext-lightbox-cap");
  let opener = null;
  const close = () => { if (dlg.open) dlg.close(); };
  dlg.addEventListener("click", close);
  dlg.addEventListener("close", () => { big.removeAttribute("src"); opener?.focus(); });

  imgs.forEach((img) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ext-zoom" + (img.classList.contains("ext-closeup") ? " is-closeup" : "");
    btn.setAttribute("aria-label", "Enlarge screenshot: " + (img.alt || ""));
    img.replaceWith(btn);
    btn.appendChild(img);
    const hint = document.createElement("span");
    hint.className = "ext-zoom-hint";
    hint.setAttribute("aria-hidden", "true");
    hint.textContent = "Click to enlarge";
    btn.appendChild(hint);
    btn.addEventListener("click", () => {
      opener = btn;
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;
      cap.textContent = img.alt;
      dlg.showModal();
    });
  });
}
wireZoom();

// "Get the app" page: install steps for this device, then phone alert choices.
import { wireLinks } from "./common.js?v=20261101r";
import * as watchlist from "./watchlist.js?v=20261101r";
import * as pwa from "./pwa.js?v=20261101r";

wireLinks();

const $ = (s) => document.querySelector(s);
const installEl = $("[data-install]"), installState = $("[data-install-state]");
const form = $("[data-form]"), statusEl = $("[data-status]"), alertState = $("[data-alert-state]");
const onBtn = $("[data-on]"), testBtn = $("[data-test]"), offBtn = $("[data-off]"), blocked = $("[data-alerts-blocked]");

const SHARE = '<svg class="app-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let deferred = null;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; renderInstall(); });
addEventListener("appinstalled", () => { deferred = null; renderInstall(true); });

function iosVersion() {
  const m = /OS (\d+)_(\d+)/.exec(navigator.userAgent);
  return m ? Number(m[1]) + Number(m[2]) / 100 : null;
}

function renderInstall(justInstalled = false) {
  if (pwa.isStandalone()) {
    installState.textContent = "Done";
    installEl.innerHTML = '<p class="app-done">You\'re in the Gator Eyes app. Next, pick your alerts below.</p>';
    return;
  }
  if (justInstalled) {
    installState.textContent = "Installed";
    installEl.innerHTML = '<p class="app-done">Installed. Open Gator Eyes from your home screen or app list, then come back to this page (Tools, then Phone alerts) to turn alerts on.</p>';
    return;
  }
  if (pwa.isIOS()) {
    const v = iosVersion();
    const old = v && v < 16.4;
    installState.textContent = "iPhone";
    installEl.innerHTML = `
      ${old ? '<p class="notice">This iPhone is on an older iOS. Phone alerts need iOS 16.4 or newer (Settings, General, Software Update). You can still add the icon.</p>' : ""}
      <ol class="app-steps">
        <li>Tap the <strong>Share</strong> button ${SHARE}. In Safari it's at the bottom of the screen (top right on iPad). In Chrome it's in the address bar.</li>
        <li>Scroll down and tap <strong>Add to Home Screen</strong>. If you don't see it, tap <strong>More</strong> or <strong>Edit Actions</strong> first.</li>
        <li>Leave <strong>Open as Web App</strong> on if you see it, then tap <strong>Add</strong>.</li>
        <li>Open <strong>Gator Eyes</strong> from your home screen and come back to this page. Step 2 only works from the home screen icon.</li>
      </ol>`;
    return;
  }
  if (deferred) {
    installState.textContent = "One tap";
    installEl.innerHTML = '<p>Your browser can install Gator Eyes like an app.</p><div class="app-actions"><button type="button" class="btn btn-amber" data-install-btn>Install Gator Eyes</button></div>';
    installEl.querySelector("[data-install-btn]").addEventListener("click", async () => {
      const d = deferred; deferred = null;
      d.prompt();
      const r = await d.userChoice.catch(() => null);
      renderInstall(r && r.outcome === "accepted");
    });
    return;
  }
  if (pwa.isAndroid()) {
    installState.textContent = "Android";
    installEl.innerHTML = `
      <ol class="app-steps">
        <li>In Chrome, tap the <strong>&#8942;</strong> menu at the top right.</li>
        <li>Tap <strong>Add to Home screen</strong> (or <strong>Install app</strong>), then <strong>Install</strong>.</li>
        <li>Open Gator Eyes from your home screen. On Android, step 2 also works right here in the browser.</li>
      </ol>`;
    return;
  }
  installState.textContent = "Computer";
  installEl.innerHTML = '<p>On a computer you can skip this step: alerts work right in this browser. To give Gator Eyes its own window, use the install icon at the right end of the address bar (Chrome and Edge).</p>';
}

function renderKinds(p) {
  $("[data-kinds]").innerHTML = pwa.KINDS.map((x) => `<label class="toggle"><input type="checkbox" name="kind" value="${x.k}"${p.kinds.includes(x.k) ? " checked" : ""}><span>${x.label}<small>${x.hint}</small></span></label>`).join("");
  form.querySelectorAll('[name="src"]').forEach((i) => { i.checked = p.src.includes(i.value); });
  form.querySelector('[name="watchOnly"]').checked = !!p.watchOnly;
}

function readForm() {
  const all = (n) => [...form.querySelectorAll(`[name="${n}"]:checked`)].map((i) => i.value);
  return { kinds: all("kind"), src: all("src"), watchOnly: form.querySelector('[name="watchOnly"]').checked };
}

function watchCount() {
  const n = watchlist.count();
  $("[data-watch-count]").textContent = n ? `${n} coin${n === 1 ? "" : "s"} on your watchlist right now. Changes to it carry over on their own.` : "Your watchlist is empty. Star coins on the Tokens page to fill it.";
}

const say = (msg, bad = false) => { statusEl.textContent = msg; statusEl.classList.toggle("is-bad", bad); };

async function renderAlerts() {
  const can = pwa.pushSupported();
  const iosBrowser = pwa.isIOS() && !pwa.isStandalone();
  if (!can || iosBrowser) {
    blocked.hidden = false;
    blocked.innerHTML = iosBrowser
      ? '<p class="notice"><strong>Finish step 1 first.</strong> On iPhone, notifications only work after you open Gator Eyes from its home screen icon.</p>'
      : '<p class="notice">This browser can\'t do phone notifications. Try Chrome, Edge, Firefox or Safari.</p>';
    form.querySelectorAll("input, button").forEach((el) => { el.disabled = true; });
    alertState.textContent = "Not available here";
    return;
  }
  blocked.hidden = true;
  const sub = await pwa.currentSub();
  const on = !!sub && Notification.permission === "granted";
  onBtn.textContent = on ? "Save changes" : "Turn on alerts";
  testBtn.hidden = !on;
  offBtn.hidden = !on;
  alertState.textContent = on ? "On" : Notification.permission === "denied" ? "Blocked" : "Off";
  if (Notification.permission === "denied") say("Notifications are blocked for Gator Eyes. Allow them in your phone's or browser's settings, then come back.", true);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const p = readForm();
  if (!p.kinds.length) return say("Pick at least one kind of alert.", true);
  if (!p.src.length && p.kinds.some((k) => k !== "watch")) return say("Pick at least one launchpad.", true);
  onBtn.disabled = true;
  say("Working…");
  // enable() asks for permission first, straight from this tap (iPhone requires that).
  const job = Notification.permission === "granted" ? pwa.currentSub().then((s) => (s ? pwa.save(p, s) : pwa.enable(p))) : pwa.enable(p);
  job.then(() => { say("Alerts are on. You'll get a notification when the gator spots something you picked."); return renderAlerts(); })
    .catch((err) => say(err.message || String(err), true))
    .finally(() => { onBtn.disabled = false; });
});

testBtn.addEventListener("click", async () => {
  testBtn.disabled = true;
  say("Sending a test…");
  try {
    const r = await pwa.test();
    say(r.ok ? "Test sent. It should show up in a few seconds." : "The push service didn't take the test (code " + r.status + "). Turn alerts off and on again.", !r.ok);
  } catch (err) { say(err.message || String(err), true); }
  testBtn.disabled = false;
});

offBtn.addEventListener("click", async () => {
  offBtn.disabled = true;
  await pwa.disable();
  say("Alerts are off for this device.");
  offBtn.disabled = false;
  renderAlerts();
});

renderInstall();
renderKinds(pwa.savedPrefs() || pwa.DEFAULT_PREFS);
watchCount();
watchlist.on(watchCount);
renderAlerts();

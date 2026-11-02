# Gator Eyes website

## Stat cards

The coin image tool is named **Stat card** throughout navigation, page titles,
accessibility labels, and Quagmire replies. Its existing `coincard.html` address
and coin query parameters remain unchanged so previously shared links work.
Quagmire also accepts the older “share card” and “coin card” phrases.
Daily flow cards retain their separate name. Historical social posts are unchanged.

Run `node tests/stat-card-name.cjs` to check naming and backward-compatible aliases.

Static site for Gator Eyes, the free Solada tracker. No build step.

- Pages: index.html, tokens.html, race.html, flows.html, followup.html, watchlist.html (browser-saved watchlist), tools.html, holders.html, coincard.html, gaey.html, about.html (How it works), card.html (daily flow card), embed.html (widget)
- Watchlist: assets/js/watchlist.js stores starred coins in localStorage (key `ge-watchlist`, max 60), assets/js/coinrow.js renders the shared coin row for Tokens and Watchlist, assets/js/watch.js is the page. `watchlist.html?w=id1,id2` offers to import a list shared from another device.
- Links, referral code and feed URL live in assets/js/config.js
- Live data comes from the Cloudflare worker's /feed endpoint

Hosted on Render as a static site (render.yaml). Upload changed files to GitHub and Render redeploys on its own.

## Phone app (PWA) and phone alerts

- `manifest.json` + icons (`assets/img/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`) make the site installable ("Add to Home Screen" on iPhone, Install on Android/desktop). Every page except embed.html links the manifest.
- `sw.js` (root, scope `/`): shows push notifications, sets the home-screen badge, opens the alerts list on tap, and shows `offline.html` when there's no connection. It never caches live data.
- `app.html` + `assets/js/app.js`: install steps for the visitor's device, then alert choices (types, launchpads, "only my watchlist"), Turn on / Send a test / Turn off.
- `assets/js/pwa.js`: loaded on every page via common.js. Registers the service worker, re-sends the watchlist to the worker when "only my watchlist" is on and the list changes, and shows a one-time "Turn on alerts" nudge inside the installed app.
- Choices are saved in localStorage `ge-push`; the worker keeps the phone's push address and choices (see the worker README, `/push/*`). `pushUrl` and `pushKey` live in config.js.

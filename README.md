# Gator Eyes website

Static site for Gator Eyes, the free Solada tracker. No build step.

- Pages: index.html, tokens.html, race.html, flows.html, followup.html, watchlist.html (browser-saved watchlist), tools.html, holders.html, coincard.html, gaey.html, about.html (How it works), card.html (daily flow card), embed.html (widget)
- Watchlist: assets/js/watchlist.js stores starred coins in localStorage (key `ge-watchlist`, max 60), assets/js/coinrow.js renders the shared coin row for Tokens and Watchlist, assets/js/watch.js is the page. `watchlist.html?w=id1,id2` offers to import a list shared from another device.
- Links, referral code and feed URL live in assets/js/config.js
- Live data comes from the Cloudflare worker's /feed endpoint

Hosted on Render as a static site (render.yaml). Upload changed files to GitHub and Render redeploys on its own.

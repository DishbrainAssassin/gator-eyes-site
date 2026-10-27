# Gator Eyes website

Static site for Gator Eyes, the free Solada tracker. No build step.

- Pages: index.html, flows.html, gaey.html, about.html (How it works), card.html (daily flow card), embed.html (widget)
- Links, referral code and feed URL live in assets/js/config.js
- Live data comes from the Cloudflare worker's /feed endpoint

Hosted on Render as a static site (render.yaml). Upload changed files to GitHub and Render redeploys on its own.

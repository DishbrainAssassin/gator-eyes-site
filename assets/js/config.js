// Gator Eyes site settings. Change links here; every page reads from this file.
export const CONFIG = {
  feedUrl: "https://gator-eyes.nlunn6731.workers.dev/feed",
  refreshMs: 60000,
  // Phone alerts (Web Push). pushUrl is the worker; pushKey is its public VAPID key (safe to publish).
  pushUrl: "https://gator-eyes.nlunn6731.workers.dev/push",
  pushKey: "BP2YMMW2RR-4nV1SIYKjj-ku7GXIui548KK6ZPWiCvvp6hcyFnNWfzg90bZDez94WqBb0GUkAfHNAGgsJdT6np4",
  ref: "6pxznt5n",
  solada: "https://www.solada.fun",
  discord: "https://discord.gg/8vq4NkAj6v",
  x: "https://x.com/GatorEyesADA",
  xHandle: "@GatorEyesADA",
  watchToken: "draft-gaey",
  // $GAEY's permanent Solada coin page (the old draft-gaey address only works because Solada forwards it).
  watchSlug: "7477b579ed8bd221dcbbd730f859b22ce9a7935635ab4ae8b70a660c",
  // Facts about $GAEY from its Solada listing. The live price, market cap and holders come from the feed.
  gaey: {
    name: "Gator Eyes",
    ticker: "GAEY",
    totalSupply: 1000000000,
    cardanoPolicy: "7477b579ed8bd221dcbbd730f859b22ce9a7935635ab4ae8b70a660c",
    solanaMint: "Eh43dde8NmGPhyEc6JHgTm4eKqk4LTf5YDg7M5RadkbD",
  },
};

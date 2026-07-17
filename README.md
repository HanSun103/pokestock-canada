# PokéStock Canada

PokéStock Canada is a Canada-first proof of concept for finding official Pokémon TCG releases and understanding whether a public price is close to the official Canadian reference price.

The project is intentionally **information-only**. It does not automate purchases, bypass queues, defeat retailer protections, or guarantee inventory.

![PokéStock Canada POC preview](poc-preview.png)

## What the POC does

- Presents upcoming and recently released Pokémon TCG products in one feed.
- Links every release claim to a first-party source.
- Filters by release state, product type, and search term.
- Shows a countdown using the visitor's local date.
- Stores a personal watchlist in the browser.
- Classifies offers against a Canadian reference price when both values are available.
- Clearly distinguishes verified information from unavailable or pending information.

The initial catalog is a small curated dataset, not a live stock feed. See [PROPOSAL.md](PROPOSAL.md) for the product roadmap and data strategy.

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm start
```

Open `http://localhost:4173`. The included development server uses only Node.js; alternatively, any static HTTP server can serve this directory.

## Verify

```bash
npm test
npm run check:data
```

There are no runtime dependencies and no build step. `index.html` is directly deployable to GitHub Pages.

## Deploy to GitHub Pages

1. Create a new GitHub repository.
2. Copy this folder into the repository root and push it.
3. In GitHub, open **Settings → Pages** and select **GitHub Actions** as the source.
4. The included workflow validates and deploys the site on pushes to `main`.

## Catalog editing

Edit `data/products.json`. Each record must include a unique ID, official source, release date, verification timestamp, and Canadian availability scope. Run `npm run check:data` before committing.

Prices should be recorded only when a public source supports them. Use `null` when an official Canadian reference price or retailer offer is not known. Never infer CAD prices from US pricing.

## Project layout

```text
.
├── .github/workflows/   # CI and GitHub Pages deployment
├── data/products.json   # Curated POC catalog
├── src/                 # UI and reusable catalog logic
├── tests/               # Node test suite
├── index.html
├── styles.css
├── PROPOSAL.md
└── README.md
```

## Trademark notice

This is an independent fan project. Pokémon, Pokémon TCG, and related names are trademarks of their respective owners. This project is not affiliated with, sponsored by, or endorsed by The Pokémon Company International.

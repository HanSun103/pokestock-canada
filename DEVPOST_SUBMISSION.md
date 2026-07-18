# PokéStock Canada — submission copy

This document is ready to copy into GitHub and Devpost fields.

## Elevator pitch

Canadian collectors: catch fair-price Pokémon TCG drops before sellout. Source-linked forecasts and availability alerts.

## GitHub About description

Canada-first Pokémon TCG release radar with source-linked buying forecasts, fair-price alerts, and availability history.

## About the project

## Inspiration

Pokémon TCG collecting has become increasingly competitive in Canada. Popular products can sell out quickly, leaving collectors with reseller prices or no clear record of when the fair-price buying opportunity appeared. Most stock trackers react only when a listing is already live—and sometimes only after it has sold out.

PokéStock Canada started from a different question: can public release signals give Canadian collectors useful preparation time before the buying window opens?

## What it does

PokéStock collects official Pokémon news, permitted public feeds, and dated Canadian retail observations. Official product confirmation starts the Release radar, which moves each active product through Product confirmed, Prepare, Live now, and explicit Restock watch states.

For upcoming products, the application presents a Canada availability outlook based on the official launch date, Canadian retailer activity, and comparable products from the same release wave. Forecasts are clearly separated from confirmed dates and every conclusion links back to its evidence.

A separate Canadian availability record preserves completed buying events with the first-seen date, observed price, availability state, and last-check date. PokéStock does not buy products, bypass queues, or guarantee inventory.

## How we built it

The frontend is a responsive static application built with semantic HTML, CSS, and vanilla JavaScript, making it directly deployable to GitHub Pages.

A Node.js pipeline reads curated JSON sources and permitted RSS or Atom metadata, normalizes every signal, validates source URLs and dates, connects product variants, and calculates deterministic watch-state transitions. This prevents a weaker global signal from overwriting stronger Canadian availability evidence.

GPT-5.6 is an optional local reasoning layer. It converts unstructured publication metadata into strict structured records and produces evidence-based Canadian buying outlooks. GPT never discovers links by itself, and deterministic code validates its output. Results are cached by content fingerprint to avoid paying twice for unchanged evidence.

The public GitHub Actions workflow operates without an OpenAI API key. It validates curated evidence, runs the test suite, updates website data only when state changes, and can send change-only notifications without consuming model credits.

## Challenges we ran into

The hardest problem was separating three dates that are often treated as one: the official product release, the first Canadian listing or preorder, and the latest stock observation. A September product can become purchasable in July, while a launch announcement does not prove that stock is still available the next day.

Another challenge was regional evidence. A global or US “available now” post is useful context, but it cannot trigger a Canadian Live now alert. We added deterministic transition rules so later, weaker evidence cannot downgrade or overwrite a stronger Canadian state.

Retail sites also use bot protection and rapidly changing storefronts. PokéStock therefore avoids aggressive scraping, queue bypassing, and purchase automation. The POC relies on permitted feeds, official announcements, source-linked observations, and explicit freshness labels.

## Accomplishments that we're proud of

- Built a working source-to-dashboard release intelligence pipeline.
- Demonstrated advance Canada-focused outlooks for the 30th Celebration product wave.
- Preserved an auditable timeline from announcement through sale and sellout.
- Added strict regional rules so global availability cannot become a false Canadian alert.
- Added filters, sorting, watchlists, real product imagery, and dated catalog records.
- Added 21 automated tests covering normalization, forecasts, state transitions, and catalog behavior.
- Designed a zero-API-cost hosted mode while keeping GPT-5.6 available as an optional local demonstration.

## What we learned

The most useful collector alert is often not “in stock now.” It is “this exact product is confirmed, Canadian activity has started, and you should prepare.” Early evidence can create more value than reacting to a storefront after demand arrives.

We also learned that LLMs work best here as a constrained reasoning component—not as the source of truth. Connectors supply the links, structured evidence supplies the facts, GPT explains relationships and estimates a window, and deterministic rules control availability states.

## What's next for PokéStock Canada

- Add more permitted Canadian retailer and distributor feeds.
- Build a larger historical dataset for product-family timing comparisons.
- Add verified Discord and email alerts for meaningful state changes.
- Improve product entity matching across regional naming differences.
- Add a review queue for community-submitted stock observations.
- Evaluate forecast accuracy against real Canadian first-listing dates.

## Built with

OpenAI API, GPT-5.6, JavaScript, Node.js, HTML5, CSS3, GitHub Actions, GitHub Pages, JSON, RSS, Atom, Discord webhooks, Resend

## Demo video

Watch the narrated 2K walkthrough: https://youtu.be/ODu6yhmswbs

## Suggested tags

pokemon-tcg, canada, release-tracker, availability-alerts, fair-price, openai, gpt-5-6, javascript, nodejs, github-actions, github-pages, rss, collectors

## Image gallery

1. `docs/images/pokestock-banner.png` — hero banner and next product to watch.
2. `docs/images/early-signal-radar.png` — Release radar filters, product stages, GPT outlooks, and evidence-linked recommendations.
3. `docs/images/release-radar.png` — Canadian availability records, prices, dated stock states, and product imagery.
4. `docs/images/full-dashboard.png` — optional full-page application overview.

Recommended gallery order: banner, Release radar, Canadian availability record. Use the banner as the project cover image.

## Security and cost note

The `.env` file is ignored by Git and must never be committed. The hosted GitHub workflow does not reference `OPENAI_API_KEY`, so scheduled runs cannot spend OpenAI credits. GPT analysis is local and opt-in.

# Availability monitoring strategy

## The corrected product model

PokéStock Canada tracks three different facts that must never be collapsed into one date:

1. `releaseDate`: the product launch announced by The Pokémon Company International.
2. `storefront.firstSeenAt`: the first date the product was observed for sale or preorder in Canada.
3. `storefront.checkedAt` plus `storefront.status`: what the Canadian storefront showed at a specific observation time.

A product may therefore be sold out months before its announced release date. The 30th Celebration Tech Sticker Collections demonstrate exactly this case: they were observed on the Canadian storefront on July 15, 2026, while the official product page lists September 16, 2026 as the release date.

## Current POC behavior

The repository currently contains a manually verified snapshot. It records Canadian prices, first-seen dates, and availability, and the UI labels its freshness. It does not claim real-time stock.

This is more useful than a release-only calendar and more honest than an unreliable automated label.

## Why direct automation is not enabled yet

Pokémon Center protects its storefront with a traffic-management and bot-protection layer. Requests from generic server clients can be rejected even while the page works in a normal customer browser. A GitHub Actions scraper would therefore be unreliable and could create unnecessary traffic.

The project will not bypass queues, rotate identities, solve challenges, replay private browser tokens, or otherwise evade access controls.

## Responsible path to automation

Before enabling a scheduled monitor:

1. Confirm that the selected public endpoint or feed permits automated retrieval.
2. Prefer an official feed, retailer-provided API, affiliate feed, or explicit permission.
3. Poll conservatively and cache the previous response.
4. Use conditional requests where supported.
5. Stop and alert the maintainer on access denial rather than retrying aggressively.
6. Record observation time and source with every state transition.
7. Notify only when a product changes state, not on every poll.

With an approved source, the intended pipeline is:

```text
Canadian public feed → normalize products → compare previous snapshot
                                          ├── no change → stop
                                          └── changed → update snapshot → send opt-in alert
```

## Implemented POC pipeline

The repository now implements the broader early-signal pipeline:

```text
Curated official records + explicitly permitted feeds
                         ↓
                normalized signals
                         ↓
       product / Canada / timing evidence strength
                         ↓
       auditable product watch-state history
                    ↙             ↘
             data/radar.json    Discord/email
```

Run it with `npm run pipeline`. Source policy lives in `config/sources.json`. The built-in discovery layer uses public RSS/Atom endpoints and filters for TCG release language before any GPT call. A Canadian community feed is handled as lead-only: deterministic matching can raise `Prepare` for a known product, but never `Live now`. `POKESTOCK_FEED_URLS` is optional and may add only feeds whose publishers allow automated retrieval.

The pipeline preserves previous signals, deduplicates them by stable signal ID, and sends notifications only when a product changes into an actionable state. A global or US `available now` signal remains `Product confirmed`; only explicit Canadian evidence can become `Live now` or `Sold out`.

`Sold out` remains part of the audit data but is hidden from the early-signal radar. `Restock watch` requires an explicit Canadian `restock-announced` signal; a sold-out observation alone cannot create it. Active products receive a cached GPT-5.6 Canada outlook, while deterministic validation keeps estimated windows separate from official dates.

The public GitHub Actions workflow intentionally runs without `OPENAI_API_KEY`. It can process curated and permitted structured evidence, extract conservative known-product leads, reuse checked-in cached interpretations, and fail closed on other unstructured items without creating OpenAI API cost. New model calls are local and opt-in only.

Pokémon Center Canada currently returns an Incapsula access-control challenge to non-browser scheduled requests. PokéStock does not attempt to defeat that protection. Direct Pokémon Center stock states therefore come from dated human verification, while permitted public feeds provide earlier leads that remain clearly unverified until corroborated.

## Notification roadmap

The next useful increment is a change log and opt-in Discord or email notifications driven by verified snapshot updates. A later connector can replace manual snapshots without changing the front-end data model.

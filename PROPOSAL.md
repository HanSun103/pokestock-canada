# Project proposal: PokéStock Canada

## Executive summary

Canadian Pokémon TCG fans often discover releases across several announcements and storefront pages, then encounter uncertain regional availability or inflated resale prices. PokéStock Canada will turn public, attributable information into a Canada-first storefront-drop tracker, release calendar, and fair-price guide.

The service is designed to improve awareness and preparation, not purchasing speed. It will never automate checkout, evade queues, rotate identities, or ignore retailer limits.

## Problem

Collectors currently face three avoidable information gaps:

1. **Fragmentation:** announcements, product pages, and Canadian storefront listings are separate.
2. **Timing:** a Canadian buying window can open well before the announced product release date.
3. **Price ambiguity:** buyers may not know whether a price is close to a Canadian official reference.

High demand cannot be eliminated, but clearer and earlier information can give ordinary buyers a fairer chance.

## Objective

Create a trusted, accessible service that gathers official Pokémon TCG release information relevant to Canada, records its provenance, and notifies users when followed products change—while respecting retailer infrastructure and consumer protections.

## Target users

- Canadian collectors buying sealed products for personal use.
- Parents and gift buyers who need price context.
- Players tracking expansion and prerelease dates.
- Local hobby communities sharing verified release information.

## POC scope

The POC proves that a source-attributed catalog can be useful before investing in scraping, accounts, or notification infrastructure.

### Included

- Responsive release dashboard.
- Upcoming, released, and archived states.
- Product type and text filters.
- Separate official release, storefront first-seen, availability, and last-checked metadata.
- Browser-local watchlist.
- CAD reference-price comparison logic.
- Curated JSON catalog with validation.
- Automated tests and GitHub Pages deployment.

### Not included

- Live inventory claims or automatic stock checking.
- Email, SMS, Discord, or push delivery.
- User accounts or cloud database.
- Marketplace/resale price ingestion.
- Automated checkout, queue bypassing, or purchase bots.

## Information strategy

### Phase 1 sources

1. **Pokemon.com news and product gallery** for first-party product names, contents, and launch dates.
2. **Pokémon Center Canada** for Canadian availability and CAD reference prices when publicly listed.
3. **Pokémon Center Support** for regional shipping and preorder policy context.

Every fact displayed as verified should retain its source URL and a `verifiedAt` timestamp. Missing Canadian pricing stays unknown; US prices are not converted and presented as MSRP.

### Phase 2 sources

Authorized Canadian retailer pages may be added after reviewing each site's terms, robots guidance, rate limits, and data stability. Connectors should poll conservatively, cache responses, identify themselves where appropriate, and stop on access restrictions. Retailers can also be offered a structured feed or submission route.

## Fair-price method

When an official Canadian reference price exists, an offer is classified as:

- **At reference:** no more than 3% above the reference price.
- **Close to reference:** more than 3% and no more than 10% above it.
- **Above reference:** more than 10% above it.
- **Unknown:** either value is missing.

The label is guidance, not a claim that a retailer is authorized or that a purchase is advisable. Shipping and tax are excluded unless a source provides an all-in value.

## Success measures

For an eight-week pilot:

- At least 95% of published records have a working first-party source.
- Source-to-catalog publication delay is under 24 hours for curated updates.
- Zero unlabelled inferred prices.
- At least 30% of returning users maintain a watchlist.
- Fewer than 2% of published release dates require correction.

## Technical approach

The POC is a dependency-free static web application hosted on GitHub Pages. Data lives in version-controlled JSON and is validated in CI. This keeps operation inexpensive, changes reviewable, and provenance auditable.

For the production pilot:

```text
Official sources → respectful collectors → normalized database → change detector
                                                            ↘ web API
                                                             ↘ notification queue
```

A production implementation could use scheduled GitHub Actions or a small serverless job, PostgreSQL, a read-only API, and an opt-in notification provider. Exact services should be selected only after traffic, cost, and source-permission requirements are known.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Source layout changes | Adapter tests, failure alerts, and manual fallback |
| Incorrect regional assumptions | Canada-specific scope field and source attribution |
| Stale availability | Prominent timestamps; never claim live stock without a recent check |
| Excess retailer traffic | Cache, low polling frequency, backoff, and feed partnerships |
| Trademark confusion | Independent-project disclaimer and no copied brand artwork |
| Alert advantage abused by resellers | Rate limits, public information only, no checkout automation |
| Notification fatigue | Product-level opt-in and change-type preferences |

## Delivery roadmap

### Milestone 1 — POC

Static catalog, watchlist, fair-price logic, documentation, tests, and GitHub deployment.

### Milestone 2 — Curated pilot

Admin-friendly contribution workflow, scheduled source review, catalog history, and email/Discord notifications.

### Milestone 3 — Responsible monitoring

Approved retailer connectors, freshness indicators, deduplication, rate limiting, and operational alerts.

### Milestone 4 — Community launch

Accounts, regional preferences, bilingual English/French interface, moderation, retailer partnerships, and public reliability reporting.

## Go/no-go criteria for live monitoring

Proceed only when each source has a documented permission/terms review, a conservative request budget, a reliable product identity strategy, and a human escalation path. If a source blocks access or disallows monitoring, the project should link to it without collecting it.

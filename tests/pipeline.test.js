import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSignals } from "../src/pipeline/normalize.js";
import { buildRadar, changedStates } from "../src/pipeline/state-engine.js";
import { readConfiguredSources } from "../src/pipeline/connectors.js";
import { extractKnownProductLeads } from "../src/pipeline/lead-extractor.js";

const source = { id: "official", name: "Official", publisherClass: "official", region: "global" };
const product = {
  id: "sample-etb",
  name: "Sample Pokémon Center ETB",
  series: "Sample",
  type: "elite-trainer-box",
  releaseDate: "2026-09-16",
  pokemonCenterExclusive: true,
};

function item(id, eventType, publishedAt, region = "global") {
  return {
    id,
    eventType,
    publishedAt,
    discoveredAt: publishedAt,
    title: `${eventType} signal`,
    url: `https://example.com/${id}`,
    region,
    product,
    facts: [],
  };
}

test("normalization preserves evidence and rejects non-HTTPS URLs", () => {
  const [signal] = normalizeSignals([item("one", "product-confirmed", "2026-06-30T12:00:00Z")], source, "2026-06-30T12:01:00Z");
  assert.equal(signal.product.id, "sample-etb");
  assert.equal(signal.publisherClass, "official");
  assert.equal(signal.url, "https://example.com/one");

  const invalid = { ...item("bad", "product-confirmed", "2026-06-30T12:00:00Z"), url: "http://example.com/bad" };
  assert.throws(() => normalizeSignals([invalid], source, "2026-06-30T12:01:00Z"), /HTTPS/);
});

test("state engine builds an auditable watch-state timeline", () => {
  const signals = normalizeSignals([
    item("announce", "expansion-announced", "2026-06-01T12:00:00Z"),
    item("confirm", "product-confirmed", "2026-06-30T12:00:00Z"),
    item("live", "preorder-open", "2026-07-15T15:00:00Z", "ca"),
    item("closed", "sold-out", "2026-07-15T19:00:00Z", "ca"),
  ], source, "2026-07-18T12:00:00Z");
  const radar = buildRadar(signals, "2026-07-18T12:00:00Z");
  const watched = radar.products[0];

  assert.equal(watched.watchStage, "sold-out");
  assert.deepEqual(watched.history.map((entry) => entry.stage), ["early-watch", "prepare", "live-now", "sold-out"]);
  assert.equal(watched.evidence.length, 4);
  assert.equal(watched.evidenceStrength.existence, 0.95);
  assert.equal(watched.evidenceStrength.canada, 0.95);
  assert.equal(watched.evidenceStrength.timing, 0.95);
  assert.equal(watched.evidenceLabels.timing, "high");
  assert.match(watched.evidenceExplanations.timing, /not a future-date probability/);
});

test("notifications are emitted only for actual state changes", () => {
  const signals = normalizeSignals([item("confirm", "product-confirmed", "2026-06-30T12:00:00Z")], source, "2026-06-30T12:01:00Z");
  const radar = buildRadar(signals, "2026-06-30T12:01:00Z");
  assert.equal(changedStates({ products: [] }, radar).length, 1);
  assert.equal(changedStates(radar, radar).length, 0);
});

test("global availability cannot trigger a Canadian live-now alert", () => {
  const signals = normalizeSignals([item("global-live", "in-stock", "2026-07-18T12:00:00Z", "global")], source, "2026-07-18T12:01:00Z");
  const watched = buildRadar(signals, "2026-07-18T12:01:00Z").products[0];
  assert.equal(watched.watchStage, "product-confirmed");
  assert.match(watched.evidenceExplanations.timing, /outside Canada/);
});

test("later global evidence cannot downgrade confirmed Canadian availability", () => {
  const signals = normalizeSignals([
    item("ca-live", "in-stock", "2026-07-17T11:00:00Z", "ca"),
    item("global-video", "in-stock", "2026-07-17T16:00:00Z", "global"),
  ], source, "2026-07-18T12:01:00Z");
  const watched = buildRadar(signals, "2026-07-18T12:01:00Z").products[0];
  assert.equal(watched.watchStage, "live-now");
  assert.deepEqual(watched.history.map((entry) => entry.stage), ["live-now"]);
  assert.equal(watched.evidence.length, 2);
});

test("sold out alone is not a restock watch", () => {
  const soldOut = normalizeSignals([item("closed-only", "sold-out", "2026-07-18T12:00:00Z", "ca")], source, "2026-07-18T12:01:00Z");
  assert.equal(buildRadar(soldOut, "2026-07-18T12:01:00Z").products[0].watchStage, "sold-out");
  const announced = normalizeSignals([item("restock", "restock-announced", "2026-07-19T12:00:00Z", "ca")], source, "2026-07-19T12:01:00Z");
  assert.equal(buildRadar(announced, "2026-07-19T12:01:00Z").products[0].watchStage, "restock-watch");
});

test("an exact official release date strengthens timing evidence without implying Canada availability", () => {
  const signals = normalizeSignals([item("dated", "product-confirmed", "2026-07-01T12:00:00Z", "global")], source, "2026-07-01T12:01:00Z");
  const watched = buildRadar(signals, "2026-07-01T12:01:00Z").products[0];
  assert.equal(watched.evidenceLabels.timing, "high");
  assert.equal(watched.evidenceLabels.canada, "low");
  assert.equal(watched.watchStage, "prepare");
});

test("discovery feeds prefilter unrelated posts before GPT normalization", async () => {
  const feed = `<?xml version="1.0"?><rss><channel>
    <item><guid>tcg</guid><title>Pokémon TCG collection revealed</title><link>https://example.com/tcg</link><pubDate>Sat, 18 Jul 2026 12:00:00 GMT</pubDate><description>A new product will release soon.</description></item>
    <item><guid>go</guid><title>Pokémon GO event</title><link>https://example.com/go</link><pubDate>Sat, 18 Jul 2026 12:00:00 GMT</pubDate><description>A raid event is available.</description></item>
  </channel></rss>`;
  const config = {
    sources: [],
    discoveryFeeds: [{ id: "test-feed", name: "Test", url: "https://example.com/feed", enabled: true }],
    discoveryFilter: { requiredTopicTerms: ["pokémon tcg"], requiredReleaseTerms: ["release", "product"] },
    remoteFeedPolicy: { requireHttps: true, timeoutMs: 1000, userAgent: "test" },
  };
  const fetchImpl = async () => ({ ok: true, headers: { get: () => "application/rss+xml" }, text: async () => feed });
  const result = await readConfiguredSources(config, process.cwd(), "2026-07-18T12:01:00Z", fetchImpl);
  assert.equal(result.rawBatches.length, 1);
  assert.deepEqual(result.rawBatches[0].publications.map((item) => item.id), ["tcg"]);
});

test("community feeds create verification leads but never live-now evidence", () => {
  const publications = [{
    id: "community-post",
    title: "30th Celebration Booster Bundle is live",
    text: "A Canadian collector reports that the 30th Celebration Booster Bundle is in stock.",
    url: "https://example.com/community-post",
    publishedAt: "2026-07-20T12:00:00Z",
    discoveredAt: "2026-07-20T12:01:00Z",
  }];
  const knownProduct = {
    id: "30th-celebration-booster-bundle",
    name: "30th Celebration Booster Bundle",
    series: "30th Celebration",
    type: "booster-bundle",
    releaseDate: "2026-10-02",
    pokemonCenterExclusive: false,
  };
  const communitySource = { id: "community-ca", name: "Canadian community", publisherClass: "community-feed", region: "ca" };
  const leads = extractKnownProductLeads(publications, [knownProduct], communitySource);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].eventType, "canada-retailer-announced");
  const [signal] = normalizeSignals(leads, communitySource, "2026-07-20T12:01:00Z");
  assert.equal(buildRadar([signal], "2026-07-20T12:01:00Z").products[0].watchStage, "prepare");
});

test("negative availability language remains an unverified product-page lead", () => {
  const publication = {
    id: "placeholder-post",
    title: "30th Celebration Booster Bundle not yet live",
    text: "A placeholder exists for the 30th Celebration Booster Bundle.",
    url: "https://example.com/placeholder-post",
    publishedAt: "2026-07-10T12:00:00Z",
    discoveredAt: "2026-07-10T12:01:00Z",
  };
  const knownProduct = { id: "bundle", name: "30th Celebration Booster Bundle", series: "30th Celebration", type: "booster-bundle", releaseDate: null, pokemonCenterExclusive: false };
  const [lead] = extractKnownProductLeads([publication], [knownProduct], { id: "community-ca", name: "Canadian community", region: "ca" });
  assert.equal(lead.eventType, "product-page-discovered");
});

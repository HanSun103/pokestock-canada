import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSignals } from "../src/pipeline/normalize.js";
import { buildRadar, changedStates } from "../src/pipeline/state-engine.js";

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
  assert.equal(watched.confidence.existence, 0.95);
  assert.equal(watched.confidence.canada, 0.95);
  assert.equal(watched.confidence.timing, 0.95);
});

test("notifications are emitted only for actual state changes", () => {
  const signals = normalizeSignals([item("confirm", "product-confirmed", "2026-06-30T12:00:00Z")], source, "2026-06-30T12:01:00Z");
  const radar = buildRadar(signals, "2026-06-30T12:01:00Z");
  assert.equal(changedStates({ products: [] }, radar).length, 1);
  assert.equal(changedStates(radar, radar).length, 0);
});

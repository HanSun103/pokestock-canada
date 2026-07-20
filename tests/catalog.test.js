import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyPrice,
  daysUntil,
  filterProducts,
  getAvailabilityLabel,
  getCountdownLabel,
  getReleaseState,
  sortRadarProducts,
  sortByReleaseDate,
} from "../src/catalog.js";

const now = new Date(2026, 6, 17, 14, 30);

test("release state uses local calendar dates", () => {
  assert.equal(getReleaseState("2026-07-18", now), "upcoming");
  assert.equal(getReleaseState("2026-07-17", now), "released");
  assert.equal(getReleaseState("2025-01-01", now), "archived");
  assert.equal(getReleaseState(null, now), "unknown");
});

test("countdown labels are understandable", () => {
  assert.equal(daysUntil("2026-07-18", now), 1);
  assert.equal(getCountdownLabel("2026-07-18", now), "Tomorrow");
  assert.equal(getCountdownLabel("2026-07-17", now), "Releases today");
  assert.equal(getCountdownLabel("2026-07-16", now), "Released yesterday");
});

test("price classifier applies the documented thresholds", () => {
  assert.deepEqual(classifyPrice(102.99, 100), { key: "at-reference", label: "At reference" });
  assert.deepEqual(classifyPrice(103.01, 100), { key: "close", label: "Close to reference" });
  assert.deepEqual(classifyPrice(110.01, 100), { key: "above", label: "Above reference" });
  assert.deepEqual(classifyPrice(null, 100), { key: "unknown", label: "Price not verified" });
  assert.deepEqual(classifyPrice(100, null), { key: "unknown", label: "Price not verified" });
});

test("filters combine search, availability, and type", () => {
  const products = [
    { name: "Moon Tin", series: "Mega", summary: "Gengar", type: "tin", releaseDate: "2026-06-05", storefront: { status: "unknown" } },
    { name: "Future Box", series: "Thirty", summary: "Packs", type: "collection", releaseDate: "2026-09-01", storefront: { status: "sold-out" } },
  ];
  const result = filterProducts(products, { search: "future", availability: "sold-out", type: "collection" }, now);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Future Box");
});

test("sort does not mutate the input catalog", () => {
  const products = [
    { releaseDate: "2026-09-01", storefront: { firstSeenAt: "2026-07-15" } },
    { releaseDate: "2026-01-01", storefront: { firstSeenAt: null } },
  ];
  const sorted = sortByReleaseDate(products);
  assert.equal(sorted[0].releaseDate, "2026-09-01");
  assert.equal(products[0].releaseDate, "2026-09-01");
});

test("availability labels are explicit", () => {
  assert.equal(getAvailabilityLabel("sold-out"), "Sold out");
  assert.equal(getAvailabilityLabel("in-stock"), "In stock");
  assert.equal(getAvailabilityLabel("unknown"), "Not checked");
});

test("signal radar orders the most actionable stages first", () => {
  const products = [
    { name: "Confirmed", watchStage: "product-confirmed", stateChangedAt: "2026-07-20T10:00:00Z", releaseDate: "2026-07-21" },
    { name: "Prepare", watchStage: "prepare", stateChangedAt: "2026-07-19T10:00:00Z", releaseDate: "2026-09-01" },
    { name: "Live", watchStage: "live-now", stateChangedAt: "2026-07-18T10:00:00Z", releaseDate: "2026-10-01" },
    { name: "Restock", watchStage: "restock-watch", stateChangedAt: "2026-07-17T10:00:00Z", releaseDate: "2026-11-01" },
  ];

  assert.deepEqual(
    sortRadarProducts(products, "action-date", new Date(2026, 6, 20)).map((product) => product.name),
    ["Restock", "Live", "Prepare", "Confirmed"],
  );
});

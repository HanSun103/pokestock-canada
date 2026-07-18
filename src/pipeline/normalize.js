import { createHash } from "node:crypto";

export const EVENT_TYPES = new Set([
  "expansion-announced",
  "product-confirmed",
  "canada-retailer-announced",
  "product-page-discovered",
  "preorder-open",
  "in-stock",
  "sold-out",
  "restocked",
]);

const PRODUCT_TYPES = new Set(["collection", "elite-trainer-box", "tin", "booster-bundle", "booster-box", "other"]);

function isoTimestamp(value, field) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf())) throw new Error(`${field} must be a valid timestamp`);
  return timestamp.toISOString();
}

function httpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("signal URL must use HTTPS");
  return url.toString();
}

function makeId(item, sourceId) {
  if (item.id) return String(item.id);
  return createHash("sha256")
    .update(`${sourceId}\0${item.url}\0${item.title}\0${item.publishedAt}`)
    .digest("hex")
    .slice(0, 24);
}

export function normalizeSignal(item, source, collectedAt) {
  if (!EVENT_TYPES.has(item.eventType)) throw new Error(`unsupported eventType: ${item.eventType}`);
  if (!item.product?.id || !item.product?.name || !item.product?.series) throw new Error("signal product id, name, and series are required");
  const type = PRODUCT_TYPES.has(item.product.type) ? item.product.type : "other";
  const releaseDate = item.product.releaseDate ?? null;
  const publicationTimePrecision = item.publicationTimePrecision ?? "exact";
  if (!["exact", "date", "observed"].includes(publicationTimePrecision)) throw new Error("publicationTimePrecision must be exact, date, or observed");
  if (releaseDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) throw new Error("releaseDate must be null or YYYY-MM-DD");

  return {
    id: makeId(item, source.id),
    sourceId: source.id,
    sourceName: source.name,
    publisherClass: source.publisherClass,
    eventType: item.eventType,
    publishedAt: isoTimestamp(item.publishedAt, "publishedAt"),
    publicationTimePrecision,
    discoveredAt: isoTimestamp(item.discoveredAt ?? collectedAt, "discoveredAt"),
    collectedAt: isoTimestamp(collectedAt, "collectedAt"),
    title: String(item.title).trim(),
    url: httpsUrl(item.url),
    region: item.region ?? source.region ?? "unknown",
    product: {
      id: String(item.product.id),
      name: String(item.product.name),
      series: String(item.product.series),
      type,
      releaseDate,
      pokemonCenterExclusive: Boolean(item.product.pokemonCenterExclusive),
      priceCad: Number.isFinite(item.product.priceCad) ? item.product.priceCad : null,
    },
    facts: Array.isArray(item.facts) ? item.facts.map(String) : [],
    expectedAction: item.expectedAction ? String(item.expectedAction) : null,
  };
}

export function normalizeSignals(items, source, collectedAt) {
  const normalized = [];
  for (const item of items) {
    try {
      normalized.push(normalizeSignal(item, source, collectedAt));
    } catch (error) {
      throw new Error(`${source.id}: ${item.id ?? item.title ?? "unnamed item"}: ${error.message}`);
    }
  }
  return normalized;
}

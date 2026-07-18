import { labelConfidence, scoreSignal } from "./confidence.js";

export const WATCH_STAGES = ["early-watch", "product-confirmed", "prepare", "live-now", "sold-out"];

function stageFor(signal) {
  if (signal.eventType === "sold-out") return "sold-out";
  if (["preorder-open", "in-stock", "restocked"].includes(signal.eventType)) return "live-now";
  if (["canada-retailer-announced", "product-page-discovered"].includes(signal.eventType)) return "prepare";
  if (signal.eventType === "product-confirmed" && signal.product.pokemonCenterExclusive) return "prepare";
  if (signal.eventType === "product-confirmed") return "product-confirmed";
  return "early-watch";
}

function reasonFor(stage, signal) {
  if (stage === "early-watch") return "The expansion is official, but the product and Canadian buying date are not yet fully confirmed.";
  if (stage === "product-confirmed") return "The product is officially confirmed; its Canadian buying date remains unannounced.";
  if (stage === "prepare") return signal.product.pokemonCenterExclusive
    ? "A Pokémon Center-exclusive product is officially confirmed. The Canadian buying date is unannounced, so the preorder watch is active."
    : "Canadian or product-page evidence suggests the buying window may be approaching.";
  if (stage === "live-now") return "A permitted Canadian source confirms that preorder or purchase availability is open.";
  return "The initial Canadian opportunity was observed sold out; restock monitoring should continue.";
}

function mergeConfidence(current, next) {
  return {
    existence: Math.max(current?.existence ?? 0, next.existence),
    canada: Math.max(current?.canada ?? 0, next.canada),
    timing: Math.max(current?.timing ?? 0, next.timing),
  };
}

export function buildRadar(signals, generatedAt) {
  const products = new Map();
  const ordered = [...signals].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id));

  for (const signal of ordered) {
    const scored = scoreSignal(signal);
    const stage = stageFor(signal);
    const current = products.get(signal.product.id) ?? {
      ...signal.product,
      watchStage: "early-watch",
      stateChangedAt: signal.publishedAt,
      confidence: { existence: 0, canada: 0, timing: 0 },
      evidence: [],
      history: [],
    };
    const changed = current.watchStage !== stage;
    current.name = signal.product.name;
    current.series = signal.product.series;
    current.type = signal.product.type;
    current.releaseDate = signal.product.releaseDate ?? current.releaseDate;
    current.pokemonCenterExclusive ||= signal.product.pokemonCenterExclusive;
    current.priceCad = signal.product.priceCad ?? current.priceCad ?? null;
    current.confidence = mergeConfidence(current.confidence, scored);
    current.evidence.push({
      signalId: signal.id,
      eventType: signal.eventType,
      title: signal.title,
      url: signal.url,
      publishedAt: signal.publishedAt,
      publicationTimePrecision: signal.publicationTimePrecision,
      discoveredAt: signal.discoveredAt,
      region: signal.region,
      expectedAction: signal.expectedAction,
    });
    if (changed || current.history.length === 0) {
      current.watchStage = stage;
      current.stateChangedAt = signal.publishedAt;
      current.history.push({ stage, at: signal.publishedAt, signalId: signal.id, reason: reasonFor(stage, signal) });
    }
    current.reason = reasonFor(current.watchStage, signal);
    current.confidenceLabels = Object.fromEntries(Object.entries(current.confidence).map(([key, value]) => [key, labelConfidence(value)]));
    products.set(signal.product.id, current);
  }

  return {
    meta: {
      generatedAt,
      signalCount: signals.length,
      productCount: products.size,
      methodology: "Separate confidence is reported for product existence, Canadian relevance, and timing. No date is invented when a source does not publish one.",
    },
    products: [...products.values()].sort((a, b) => b.stateChangedAt.localeCompare(a.stateChangedAt)),
  };
}

export function changedStates(previousRadar, nextRadar) {
  const previous = new Map((previousRadar?.products ?? []).map((product) => [product.id, product.watchStage]));
  return nextRadar.products
    .filter((product) => previous.get(product.id) !== product.watchStage)
    .map((product) => ({
      id: `${product.id}:${product.watchStage}:${product.stateChangedAt}`,
      productId: product.id,
      productName: product.name,
      stage: product.watchStage,
      stateChangedAt: product.stateChangedAt,
      reason: product.reason,
      confidence: product.confidence,
      evidence: product.evidence.at(-1),
    }));
}

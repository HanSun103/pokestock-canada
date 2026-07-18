const SOURCE_WEIGHT = {
  official: 0.95,
  "official-retailer": 0.9,
  "permitted-feed": 0.65,
};

const TIMING_WEIGHT = {
  "expansion-announced": 0.15,
  "product-confirmed": 0.35,
  "canada-retailer-announced": 0.65,
  "product-page-discovered": 0.7,
  "preorder-open": 1,
  "in-stock": 1,
  "sold-out": 1,
  "restock-announced": 0.9,
  restocked: 1,
};

function round(value) {
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}

export function scoreSignal(signal) {
  const source = SOURCE_WEIGHT[signal.publisherClass] ?? 0.5;
  const confirmsProduct = signal.eventType !== "expansion-announced";
  const canadaEvidence = signal.region === "ca";
  const timingSpecificity = signal.product.releaseDate && ["product-confirmed", "canada-retailer-announced", "product-page-discovered"].includes(signal.eventType)
    ? Math.max(TIMING_WEIGHT[signal.eventType] ?? 0.1, 0.9)
    : (TIMING_WEIGHT[signal.eventType] ?? 0.1);
  return {
    existence: round(confirmsProduct ? source : source * 0.58),
    canada: round(canadaEvidence ? source : signal.product.pokemonCenterExclusive ? 0.5 : 0.2),
    timing: round(timingSpecificity * source),
  };
}

export function labelEvidenceStrength(value) {
  if (value >= 0.85) return "high";
  if (value >= 0.6) return "medium";
  return "low";
}

import { labelEvidenceStrength, scoreSignal } from "./confidence.js";

export const WATCH_STAGES = ["early-watch", "product-confirmed", "prepare", "live-now", "sold-out", "restock-watch"];

const STAGE_STRENGTH = new Map(WATCH_STAGES.map((stage, index) => [stage, index]));

function stageFor(signal) {
  if (signal.eventType === "restock-announced" && signal.region === "ca") return "restock-watch";
  if (signal.eventType === "sold-out" && signal.region === "ca") return "sold-out";
  if (["preorder-open", "in-stock", "restocked"].includes(signal.eventType) && signal.region === "ca") return "live-now";
  if (["preorder-open", "in-stock", "sold-out", "restocked"].includes(signal.eventType)) return "product-confirmed";
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
  if (stage === "restock-watch") return "A dated Canadian source explicitly announces a restock; monitor the stated window.";
  return "The initial Canadian opportunity was observed sold out; restock monitoring should continue.";
}

function shouldTransition(currentStage, nextStage, signal) {
  if (currentStage === nextStage) return false;
  const isCanadianAvailabilityState = signal.region === "ca" && ["live-now", "sold-out", "restock-watch"].includes(nextStage);
  if (isCanadianAvailabilityState) return true;
  return STAGE_STRENGTH.get(nextStage) > STAGE_STRENGTH.get(currentStage);
}

function mergeEvidenceStrength(current, next) {
  return {
    existence: Math.max(current?.existence ?? 0, next.existence),
    canada: Math.max(current?.canada ?? 0, next.canada),
    timing: Math.max(current?.timing ?? 0, next.timing),
  };
}

function explainEvidence(product) {
  const hasCanadianEvidence = product.evidence.some((item) => item.region === "ca");
  const hasCanadianObservedTiming = product.evidence.some((item) => item.region === "ca" && ["preorder-open", "in-stock", "sold-out", "restocked"].includes(item.eventType));
  const hasGlobalObservedTiming = product.evidence.some((item) => item.region !== "ca" && ["preorder-open", "in-stock", "sold-out", "restocked"].includes(item.eventType));
  return {
    existence: "How strongly first-party evidence identifies this exact product—not the chance that it exists.",
    canada: hasCanadianEvidence
      ? "A dated Canadian source directly connects this product to Canada."
      : "No direct Canadian source has confirmed this product yet.",
    timing: hasCanadianObservedTiming
      ? "A buying or stock state was directly observed. This is historical evidence, not a future-date probability."
      : hasGlobalObservedTiming
        ? "A buying or stock state was observed outside Canada. This is not Canadian live confirmation or a future-date probability."
        : "How specific the published timing evidence is. It does not predict an exact live date.",
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
      evidenceStrength: { existence: 0, canada: 0, timing: 0 },
      evidence: [],
      history: [],
    };
    const changed = shouldTransition(current.watchStage, stage, signal);
    current.name = signal.product.name;
    current.series = signal.product.series;
    current.type = signal.product.type;
    current.releaseDate = signal.product.releaseDate ?? current.releaseDate;
    current.pokemonCenterExclusive ||= signal.product.pokemonCenterExclusive;
    current.priceCad = signal.product.priceCad ?? current.priceCad ?? null;
    current.evidenceStrength = mergeEvidenceStrength(current.evidenceStrength, scored);
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
      interpretation: signal.interpretation,
    });
    if (changed || current.history.length === 0) {
      current.watchStage = stage;
      current.stateChangedAt = signal.publishedAt;
      current.history.push({ stage, at: signal.publishedAt, signalId: signal.id, reason: reasonFor(stage, signal) });
    }
    current.reason = reasonFor(current.watchStage, signal);
    current.evidenceLabels = Object.fromEntries(Object.entries(current.evidenceStrength).map(([key, value]) => [key, labelEvidenceStrength(value)]));
    current.evidenceExplanations = explainEvidence(current);
    products.set(signal.product.id, current);
  }

  return {
    meta: {
      generatedAt,
      signalCount: signals.length,
      productCount: products.size,
      methodology: "Evidence strength is reported separately for product identity, Canadian relevance, and timing. These labels are not probabilities, and no date is invented when a source does not publish one.",
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
      evidenceStrength: product.evidenceStrength,
      evidenceLabels: product.evidenceLabels,
      evidence: product.evidence.at(-1),
    }));
}

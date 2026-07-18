import { createHash } from "node:crypto";

const FORECAST_SCHEMA = {
  type: "object",
  properties: {
    forecasts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          productId: { type: "string" },
          windowStart: { type: ["string", "null"] },
          windowEnd: { type: ["string", "null"] },
          recommendation: { type: "string", enum: ["watch-now", "prepare-account", "wait-for-evidence", "buy-if-fair-price", "restock-watch"] },
          conclusion: { type: "string" },
          rationale: { type: "string" },
          sourceSummary: { type: "string" },
          basisSignalIds: { type: "array", items: { type: "string" } },
        },
        required: ["productId", "windowStart", "windowEnd", "recommendation", "conclusion", "rationale", "sourceSummary", "basisSignalIds"],
        additionalProperties: false,
      },
    },
  },
  required: ["forecasts"],
  additionalProperties: false,
};

const FORECAST_INSTRUCTIONS = `You are the Canada availability analyst for a Pokémon TCG release radar.
For each supplied active product, estimate the most defensible window when it may first appear at Pokémon Center Canada or a major Canadian retailer at ordinary retail pricing.
Use only the supplied dated signals and analogous products. A US/global event can inform a forecast but is not Canadian confirmation.
When an official release date exists, distinguish it from a preorder or first-listing estimate.
When a product has an official release date plus either a Canadian retailer signal or a dated comparable product in the same series, you must return the most defensible best-estimate date range, using a broader range when uncertainty is high. Use null dates only when neither condition exists.
State the range as a model estimate, not a confirmed event. If a Canadian specialty-store preorder is already observed but fair-price or Pokémon Center availability is unknown, estimate the next fair-price major-retailer or Pokémon Center window rather than treating the specialty listing as confirmation.
Never present an estimate as official, never invent a source, price, restock, or Canadian event, and never recommend buying above a supported fair retail price.
Use restock-watch only when an explicit dated signal announces a future restock. Keep conclusions concise and action-oriented.`;

function outputText(response) {
  const parts = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  if (!parts.length) throw new Error("GPT-5.6 forecast response did not contain structured output text");
  return parts.join("");
}

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function forecastFingerprint(products, signals) {
  return createHash("sha256").update(JSON.stringify({
    forecastVersion: 2,
    products: products.map(({ id, name, series, type, releaseDate, pokemonCenterExclusive, watchStage }) => ({ id, name, series, type, releaseDate, pokemonCenterExclusive, watchStage })),
    signals: signals.map(({ id, eventType, publishedAt, region, title, product, facts }) => ({ id, eventType, publishedAt, region, title, productId: product.id, facts })),
  })).digest("hex");
}

export function fallbackOutlook(product) {
  if (product.watchStage === "live-now") {
    const latestCanadianAvailability = [...product.evidence]
      .filter((item) => item.region === "ca" && ["preorder-open", "in-stock", "restocked"].includes(item.eventType))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
    const observedDate = latestCanadianAvailability?.publishedAt?.slice(0, 10) ?? null;
    return {
      windowStart: observedDate,
      windowEnd: observedDate,
      recommendation: "buy-if-fair-price",
      conclusion: "Canadian retail availability confirmed",
      rationale: "A dated permitted Canadian source confirms that preorder or purchase availability is open. Check the linked retailer because stock can change by location and time.",
      sourceSummary: latestCanadianAvailability ? `Confirmed by: ${latestCanadianAvailability.title}` : "Confirmed by dated Canadian availability evidence.",
      basisSignalIds: latestCanadianAvailability ? [latestCanadianAvailability.signalId] : product.evidence.map((item) => item.signalId),
      generatedBy: "deterministic-confirmed",
      generatedAt: null,
    };
  }
  const releaseText = product.releaseDate ? ` Official release: ${product.releaseDate}.` : "";
  return {
    windowStart: null,
    windowEnd: null,
    recommendation: product.watchStage === "restock-watch" ? "restock-watch" : "watch-now",
    conclusion: `No reliable Canada listing date yet—watch now.${releaseText}`,
    rationale: "The available evidence does not support a narrower Canadian buying window.",
    sourceSummary: "Dated source records; no model forecast available.",
    basisSignalIds: product.evidence.map((item) => item.signalId),
    generatedBy: "deterministic-fallback",
    generatedAt: null,
  };
}

export async function forecastCanadaAvailability(products, signals, options = {}) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required to generate Canada availability forecasts");
  const model = options.model ?? process.env.OPENAI_MODEL ?? "gpt-5.6";
  const currentDate = options.currentDate ?? new Date().toISOString().slice(0, 10);
  const fetchImpl = options.fetchImpl ?? fetch;
  const allowedProducts = new Set(products.map((product) => product.id));
  const allowedSignals = new Set(signals.map((signal) => signal.id));
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "medium" },
      input: [
        { role: "system", content: FORECAST_INSTRUCTIONS },
        { role: "user", content: JSON.stringify({
          currentDate,
          targetMarket: "Canada",
          targetEvent: "First fair-price listing or preorder at Pokémon Center Canada or a major Canadian retailer",
          products: products.map(({ id, name, series, type, releaseDate, pokemonCenterExclusive, watchStage }) => ({ id, name, series, type, releaseDate, pokemonCenterExclusive, watchStage })),
          datedSignals: signals.map(({ id, eventType, publishedAt, publicationTimePrecision, region, title, product, facts, url }) => ({ id, eventType, publishedAt, publicationTimePrecision, region, title, productId: product.id, facts, url })),
        }) },
      ],
      text: { verbosity: "low", format: { type: "json_schema", name: "pokestock_canada_forecasts", schema: FORECAST_SCHEMA, strict: true } },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI Responses API returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const apiResponse = await response.json();
  const parsed = JSON.parse(outputText(apiResponse));
  const forecasts = new Map();
  for (const forecast of parsed.forecasts ?? []) {
    if (!allowedProducts.has(forecast.productId)) continue;
    const windowStart = isDate(forecast.windowStart) ? forecast.windowStart : null;
    const windowEnd = isDate(forecast.windowEnd) ? forecast.windowEnd : null;
    forecasts.set(forecast.productId, {
      ...forecast,
      windowStart,
      windowEnd: windowStart && windowEnd && windowEnd < windowStart ? windowStart : windowEnd,
      basisSignalIds: forecast.basisSignalIds.filter((id) => allowedSignals.has(id)),
      generatedBy: apiResponse.model ?? model,
      generatedAt: new Date().toISOString(),
      responseId: apiResponse.id ?? null,
    });
  }
  return { model: apiResponse.model ?? model, responseId: apiResponse.id ?? null, forecasts };
}

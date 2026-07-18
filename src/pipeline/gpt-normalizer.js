import { createHash } from "node:crypto";

export const DEFAULT_OPENAI_MODEL = "gpt-5.6";

const EVENT_TYPES = [
  "expansion-announced",
  "product-confirmed",
  "canada-retailer-announced",
  "product-page-discovered",
  "preorder-open",
  "in-stock",
  "sold-out",
  "restock-announced",
  "restocked",
];

const PRODUCT_TYPES = ["collection", "ultra-premium-collection", "figure-collection", "elite-trainer-box", "battle-deck", "tin", "booster-bundle", "booster-box", "blister", "other"];

const SIGNAL_SCHEMA = {
  type: "object",
  properties: {
    signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          eventType: { type: "string", enum: EVENT_TYPES },
          title: { type: "string" },
          region: { type: "string", enum: ["ca", "global", "unknown"] },
          product: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              series: { type: "string" },
              type: { type: "string", enum: PRODUCT_TYPES },
              releaseDate: { type: ["string", "null"] },
              pokemonCenterExclusive: { type: "boolean" },
              priceCad: { type: ["number", "null"] },
            },
            required: ["id", "name", "series", "type", "releaseDate", "pokemonCenterExclusive", "priceCad"],
            additionalProperties: false,
          },
          facts: { type: "array", items: { type: "string" } },
          expectedAction: { type: ["string", "null"] },
          sourceUrl: { type: ["string", "null"] },
        },
        required: ["eventType", "title", "region", "product", "facts", "expectedAction", "sourceUrl"],
        additionalProperties: false,
      },
    },
    reviewNote: { type: ["string", "null"] },
  },
  required: ["signals", "reviewNote"],
  additionalProperties: false,
};

const INSTRUCTIONS = `You normalize public Pokémon TCG release metadata into evidence records for Canadian collectors.
Use only facts explicitly present in the supplied publication. Never invent a product, date, price, Canadian relevance, exclusivity, or availability state.
Match a known product ID when the publication clearly refers to it. Otherwise create a stable lowercase hyphenated ID.
Use region "ca" only for explicit Canadian evidence. A global or US announcement is not Canadian evidence.
Use preorder-open, in-stock, sold-out, restock-announced, or restocked only when the source explicitly reports that state. Restock-announced requires a future restock message; a sold-out observation alone is not a restock watch.
Extract every distinct named TCG product or explicitly named variant in a release lineup; do not stop after matching known products. Keep Day and Night, character, or packaging variants separate when the publication names them separately.
Set sourceUrl only to the publication URL or one of the supplied linkedUrls. Prefer a linked first-party Pokémon URL when it directly supports the signal; otherwise use the publication URL.
Return no signals when the publication is unrelated, too ambiguous, or speculative. Put the reason in reviewNote.
Expected actions may recommend monitoring or alerting, but must never automate purchasing or bypass retailer controls.`;

function outputText(response) {
  const parts = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  if (!parts.length) throw new Error("GPT-5.6 response did not contain structured output text");
  return parts.join("");
}

export function publicationFingerprint(publication) {
  return createHash("sha256")
    .update(JSON.stringify({
      title: publication.title,
      url: publication.url,
      publishedAt: publication.publishedAt,
      text: publication.text ?? "",
      linkedUrls: publication.linkedUrls ?? [],
    }))
    .digest("hex");
}

export async function analyzePublicationWithGpt(publication, knownProducts = [], options = {}) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required to analyze unstructured publications");
  const model = options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const fingerprint = publicationFingerprint(publication);
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: INSTRUCTIONS },
        {
          role: "user",
          content: JSON.stringify({
            publication: {
              title: publication.title,
              url: publication.url,
              publishedAt: publication.publishedAt,
              text: publication.text ?? "",
              linkedUrls: publication.linkedUrls ?? [],
            },
            knownProducts: knownProducts.map(({ id, name, series, type, releaseDate }) => ({ id, name, series, type, releaseDate })),
          }),
        },
      ],
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "pokestock_release_signals",
          schema: SIGNAL_SCHEMA,
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`OpenAI Responses API returned ${response.status}: ${detail}`);
  }

  const apiResponse = await response.json();
  const parsed = JSON.parse(outputText(apiResponse));
  if (!Array.isArray(parsed.signals)) throw new Error("GPT-5.6 output must include a signals array");

  return {
    fingerprint,
    model: apiResponse.model ?? model,
    responseId: apiResponse.id ?? null,
    reviewNote: parsed.reviewNote,
    signals: parsed.signals.map((signal, index) => {
      const allowedUrls = new Set([publication.url, ...(publication.linkedUrls ?? [])]);
      const sourceUrl = allowedUrls.has(signal.sourceUrl) && signal.sourceUrl?.startsWith("https://") ? signal.sourceUrl : publication.url;
      const { sourceUrl: _sourceUrl, ...safeSignal } = signal;
      return {
      ...safeSignal,
      id: `${publication.id ?? fingerprint.slice(0, 16)}-gpt-${index + 1}`,
      publishedAt: publication.publishedAt,
      publicationTimePrecision: publication.publicationTimePrecision ?? "exact",
      discoveredAt: publication.discoveredAt,
      url: sourceUrl,
      interpretation: {
        provider: "OpenAI",
        model: apiResponse.model ?? model,
        responseId: apiResponse.id ?? null,
        sourceFingerprint: fingerprint,
      },
    };}),
  };
}

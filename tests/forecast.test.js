import test from "node:test";
import assert from "node:assert/strict";
import { fallbackOutlook, forecastCanadaAvailability, forecastFingerprint } from "../src/pipeline/forecast.js";

const product = {
  id: "upc-day",
  name: "UPC Day",
  series: "30th Celebration",
  type: "ultra-premium-collection",
  releaseDate: "2026-11-06",
  pokemonCenterExclusive: false,
  watchStage: "prepare",
  evidence: [{ signalId: "official" }],
};
const signal = {
  id: "official",
  eventType: "product-confirmed",
  publishedAt: "2026-07-01T12:00:00Z",
  publicationTimePrecision: "date",
  region: "global",
  title: "UPC confirmed",
  product: { id: "upc-day" },
  facts: ["Official release is November 6."],
  url: "https://example.com/official",
};

test("forecast fingerprint is stable for the same evidence", () => {
  assert.equal(forecastFingerprint([product], [signal]), forecastFingerprint([product], [signal]));
});

test("GPT-5.6 forecast uses structured output and validates IDs and dates", async () => {
  let requestBody;
  const fetchImpl = async (_url, request) => {
    requestBody = JSON.parse(request.body);
    return {
      ok: true,
      async json() {
        return {
          id: "resp_forecast",
          model: "gpt-5.6-sol",
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ forecasts: [{
            productId: "upc-day",
            windowStart: "2026-07-20",
            windowEnd: "2026-08-03",
            recommendation: "prepare-account",
            conclusion: "Best estimate: watch from July 20 through August 3.",
            rationale: "A comparable Canadian listing followed its reveal by about two weeks.",
            sourceSummary: "Official global reveal plus a dated Canadian comparison.",
            basisSignalIds: ["official", "invented"],
          }] }) }] }],
        };
      },
    };
  };
  const result = await forecastCanadaAvailability([product], [signal], { apiKey: "test", currentDate: "2026-07-18", fetchImpl });
  assert.equal(requestBody.reasoning.effort, "medium");
  assert.equal(requestBody.text.format.strict, true);
  assert.equal(result.forecasts.get("upc-day").windowStart, "2026-07-20");
  assert.deepEqual(result.forecasts.get("upc-day").basisSignalIds, ["official"]);
});

test("fallback outlook never invents a Canada date", () => {
  const outlook = fallbackOutlook(product);
  assert.equal(outlook.windowStart, null);
  assert.match(outlook.conclusion, /No reliable Canada listing date/);
});

test("confirmed Canadian availability replaces a stale future forecast", () => {
  const liveProduct = {
    ...product,
    watchStage: "live-now",
    evidence: [{
      signalId: "ca-live",
      eventType: "in-stock",
      region: "ca",
      publishedAt: "2026-07-17T11:00:00Z",
      title: "Canadian retailer confirms availability",
    }],
  };
  const outlook = fallbackOutlook(liveProduct);
  assert.equal(outlook.windowStart, "2026-07-17");
  assert.equal(outlook.windowEnd, "2026-07-17");
  assert.equal(outlook.recommendation, "buy-if-fair-price");
  assert.equal(outlook.generatedBy, "deterministic-confirmed");
  assert.match(outlook.conclusion, /availability confirmed/i);
});

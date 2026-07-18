import test from "node:test";
import assert from "node:assert/strict";
import { analyzePublicationWithGpt, publicationFingerprint } from "../src/pipeline/gpt-normalizer.js";

const publication = {
  id: "official-example",
  title: "30th Celebration product lineup",
  url: "https://www.pokemon.com/example",
  publishedAt: "2026-06-30T13:20:00Z",
  publicationTimePrecision: "date",
  discoveredAt: "2026-06-30T14:00:00Z",
  text: "The lineup includes a Pokémon Center Elite Trainer Box. No preorder date was announced.",
};

test("GPT-5.6 normalizer requests strict structured output and preserves source facts", async () => {
  let requestBody;
  const fetchImpl = async (_url, request) => {
    requestBody = JSON.parse(request.body);
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          id: "resp_test",
          model: "gpt-5.6-sol-2026-07-13",
          output: [{
            type: "message",
            content: [{
              type: "output_text",
              text: JSON.stringify({
                signals: [{
                  eventType: "product-confirmed",
                  title: "30th Celebration Pokémon Center ETB confirmed",
                  region: "global",
                  product: {
                    id: "30th-celebration-pokemon-center-etb",
                    name: "30th Celebration Pokémon Center Elite Trainer Box",
                    series: "30th Celebration",
                    type: "elite-trainer-box",
                    releaseDate: "2026-09-16",
                    pokemonCenterExclusive: true,
                    priceCad: null,
                  },
                  facts: ["The product is in the official lineup.", "No preorder date was announced."],
                  expectedAction: "Create a prepare watch.",
                  sourceUrl: publication.url,
                }],
                reviewNote: null,
              }),
            }],
          }],
        };
      },
    };
  };

  const result = await analyzePublicationWithGpt(publication, [], { apiKey: "test-key", fetchImpl });
  assert.equal(requestBody.model, "gpt-5.6");
  assert.equal(requestBody.reasoning.effort, "low");
  assert.equal(requestBody.text.format.type, "json_schema");
  assert.equal(requestBody.text.format.strict, true);
  assert.match(requestBody.input[0].content, /every distinct named TCG product/);
  assert.equal(result.signals[0].url, publication.url);
  assert.equal(result.signals[0].publishedAt, publication.publishedAt);
  assert.equal(result.signals[0].interpretation.model, "gpt-5.6-sol-2026-07-13");
  assert.equal(result.signals[0].interpretation.sourceFingerprint, publicationFingerprint(publication));
});

test("GPT-5.6 normalizer accepts only host-supplied evidence URLs", async () => {
  const linkedPublication = { ...publication, linkedUrls: ["https://www.pokemon.com/us/official-product"] };
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        id: "resp_urls",
        model: "gpt-5.6-sol",
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
          signals: [{
            eventType: "product-confirmed",
            title: "Product confirmed",
            region: "global",
            product: { id: "product", name: "Product", series: "Series", type: "collection", releaseDate: null, pokemonCenterExclusive: false, priceCad: null },
            facts: [],
            expectedAction: null,
            sourceUrl: "https://invented.example/product",
          }],
          reviewNote: null,
        }) }] }],
      };
    },
  });
  const result = await analyzePublicationWithGpt(linkedPublication, [], { apiKey: "test-key", fetchImpl });
  assert.equal(result.signals[0].url, publication.url);
});

test("GPT-5.6 normalizer fails closed without an API key", async () => {
  await assert.rejects(() => analyzePublicationWithGpt(publication, [], { apiKey: "" }), /OPENAI_API_KEY/);
});

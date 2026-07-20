import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfiguredSources } from "./pipeline/connectors.js";
import { analyzePublicationWithGpt, publicationFingerprint } from "./pipeline/gpt-normalizer.js";
import { normalizeSignals } from "./pipeline/normalize.js";
import { buildRadar, changedStates } from "./pipeline/state-engine.js";
import { fallbackOutlook, forecastCanadaAvailability, forecastFingerprint } from "./pipeline/forecast.js";
import { extractKnownProductLeads } from "./pipeline/lead-extractor.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dryRun = process.argv.includes("--dry-run");
const nowArgument = process.argv.find((argument) => argument.startsWith("--now="))?.slice(6);
const collectedAt = new Date(nowArgument ?? Date.now()).toISOString();

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

const config = await readJson(resolve(root, "config/sources.json"));
const catalog = await readJson(resolve(root, "data/products.json"), { products: [] });
const signalsPath = resolve(root, "data/signals.json");
const previousSignalDocument = await readJson(signalsPath, { signals: [] });
const knownProducts = [...new Map([
  ...catalog.products.map((product) => [product.id, product]),
  ...previousSignalDocument.signals.map((signal) => [signal.product.id, signal.product]),
]).values()];
const cachePath = resolve(root, "data/gpt-cache.json");
const gptCache = await readJson(cachePath, { version: 1, entries: {} });
const requestedModel = process.env.OPENAI_MODEL ?? "gpt-5.6";
let cacheChanged = false;
const forecastCachePath = resolve(root, "data/forecast-cache.json");
const forecastCache = await readJson(forecastCachePath, { version: 1, entries: {} });
let forecastCacheChanged = false;

const { batches, rawBatches } = await readConfiguredSources(config, root, collectedAt);
const interpretedBatches = [];
const leadBatches = rawBatches
  .filter(({ source }) => source.leadOnly)
  .map(({ source, publications }) => ({ source, items: extractKnownProductLeads(publications, knownProducts, source) }))
  .filter(({ items }) => items.length);
const gptBatches = rawBatches.filter(({ source }) => !source.leadOnly);

if (gptBatches.length && !process.env.OPENAI_API_KEY) {
  console.warn("Skipping unstructured feed items because OPENAI_API_KEY is not configured.");
}

if (process.env.OPENAI_API_KEY) {
  for (const { source, publications } of gptBatches) {
    const items = [];
    for (const publication of publications) {
      const fingerprint = publicationFingerprint(publication);
      const cached = gptCache.entries[fingerprint];
      if (cached?.requestedModel === requestedModel) {
        items.push(...cached.signals);
        continue;
      }

      const analysis = await analyzePublicationWithGpt(publication, knownProducts, {
        apiKey: process.env.OPENAI_API_KEY,
        model: requestedModel,
      });
      items.push(...analysis.signals);
      gptCache.entries[fingerprint] = {
        requestedModel,
        resolvedModel: analysis.model,
        responseId: analysis.responseId,
        interpretedAt: collectedAt,
        reviewNote: analysis.reviewNote,
        signals: analysis.signals,
      };
      cacheChanged = true;
    }
    interpretedBatches.push({ source, items });
  }
}

const allBatches = [...batches, ...leadBatches, ...interpretedBatches];
const signals = allBatches.flatMap(({ source, items }) => normalizeSignals(items, source, collectedAt));
const uniqueSignals = [...new Map(signals.map((signal) => [signal.id, signal])).values()]
  .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id));

const radarPath = resolve(root, "data/radar.json");
const outboxPath = resolve(root, "data/notification-outbox.json");
const previousRadar = await readJson(radarPath, { products: [] });
const previousSignals = new Map(previousSignalDocument.signals.map((signal) => [signal.id, signal]));
const mergedSignals = [...new Map([
  ...previousSignalDocument.signals.map((signal) => [signal.id, signal]),
  ...uniqueSignals.map((signal) => [signal.id, { ...signal, collectedAt: previousSignals.get(signal.id)?.collectedAt ?? signal.collectedAt }]),
]).values()].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id));
const candidateRadar = buildRadar(mergedSignals, collectedAt);
const forecastProducts = candidateRadar.products.filter((product) => !["sold-out", "live-now"].includes(product.watchStage));
const forecastKey = forecastFingerprint(forecastProducts, mergedSignals);
let forecastEntries = forecastCache.entries[forecastKey]?.forecasts ?? null;
if (!forecastEntries && process.env.OPENAI_API_KEY && forecastProducts.length) {
  const result = await forecastCanadaAvailability(forecastProducts, mergedSignals, {
    apiKey: process.env.OPENAI_API_KEY,
    model: requestedModel,
    currentDate: collectedAt.slice(0, 10),
  });
  forecastEntries = Object.fromEntries([...result.forecasts.entries()]);
  forecastCache.entries[forecastKey] = {
    requestedModel,
    resolvedModel: result.model,
    responseId: result.responseId,
    generatedAt: collectedAt,
    forecasts: forecastEntries,
  };
  forecastCacheChanged = true;
}
const previousOutlooks = new Map((previousRadar.products ?? []).map((product) => [product.id, product.outlook]));
for (const product of candidateRadar.products) {
  if (product.watchStage === "live-now") {
    product.outlook = fallbackOutlook(product);
    continue;
  }
  const forecast = forecastEntries?.[product.id];
  product.outlook = forecast ?? previousOutlooks.get(product.id) ?? fallbackOutlook(product);
}
const radarChanged = JSON.stringify(previousRadar.products ?? []) !== JSON.stringify(candidateRadar.products);
const nextRadar = radarChanged ? candidateRadar : { ...candidateRadar, meta: { ...candidateRadar.meta, generatedAt: previousRadar.meta?.generatedAt ?? collectedAt } };
const outbox = { generatedAt: collectedAt, events: changedStates(previousRadar, nextRadar) };

if (dryRun) {
  console.log(JSON.stringify({ radar: nextRadar, outbox }, null, 2));
} else {
  const writes = [
    writeFile(signalsPath, `${JSON.stringify({ meta: { generatedAt: nextRadar.meta.generatedAt, count: mergedSignals.length }, signals: mergedSignals }, null, 2)}\n`),
    writeFile(radarPath, `${JSON.stringify(nextRadar, null, 2)}\n`),
    writeFile(outboxPath, `${JSON.stringify(outbox, null, 2)}\n`),
  ];
  if (cacheChanged) writes.push(writeFile(cachePath, `${JSON.stringify(gptCache, null, 2)}\n`));
  if (forecastCacheChanged) writes.push(writeFile(forecastCachePath, `${JSON.stringify(forecastCache, null, 2)}\n`));
  await Promise.all(writes);
  console.log(`Pipeline complete: ${mergedSignals.length} signals, ${nextRadar.products.length} products, ${outbox.events.length} state changes.`);
}

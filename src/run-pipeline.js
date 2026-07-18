import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfiguredSources } from "./pipeline/connectors.js";
import { normalizeSignals } from "./pipeline/normalize.js";
import { buildRadar, changedStates } from "./pipeline/state-engine.js";

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
const { batches } = await readConfiguredSources(config, root, collectedAt);
const signals = batches.flatMap(({ source, items }) => normalizeSignals(items, source, collectedAt));
const uniqueSignals = [...new Map(signals.map((signal) => [signal.id, signal])).values()]
  .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id));

const radarPath = resolve(root, "data/radar.json");
const signalsPath = resolve(root, "data/signals.json");
const outboxPath = resolve(root, "data/notification-outbox.json");
const previousRadar = await readJson(radarPath, { products: [] });
const previousSignalDocument = await readJson(signalsPath, { signals: [] });
const previousSignals = new Map(previousSignalDocument.signals.map((signal) => [signal.id, signal]));
const mergedSignals = [...new Map([
  ...previousSignalDocument.signals.map((signal) => [signal.id, signal]),
  ...uniqueSignals.map((signal) => [signal.id, { ...signal, collectedAt: previousSignals.get(signal.id)?.collectedAt ?? signal.collectedAt }]),
]).values()].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id));
const candidateRadar = buildRadar(mergedSignals, collectedAt);
const radarChanged = JSON.stringify(previousRadar.products ?? []) !== JSON.stringify(candidateRadar.products);
const nextRadar = radarChanged ? candidateRadar : { ...candidateRadar, meta: { ...candidateRadar.meta, generatedAt: previousRadar.meta?.generatedAt ?? collectedAt } };
const outbox = { generatedAt: collectedAt, events: changedStates(previousRadar, nextRadar) };

if (dryRun) {
  console.log(JSON.stringify({ radar: nextRadar, outbox }, null, 2));
} else {
  await Promise.all([
    writeFile(signalsPath, `${JSON.stringify({ meta: { generatedAt: nextRadar.meta.generatedAt, count: mergedSignals.length }, signals: mergedSignals }, null, 2)}\n`),
    writeFile(radarPath, `${JSON.stringify(nextRadar, null, 2)}\n`),
    writeFile(outboxPath, `${JSON.stringify(outbox, null, 2)}\n`),
  ]);
  console.log(`Pipeline complete: ${mergedSignals.length} signals, ${nextRadar.products.length} products, ${outbox.events.length} state changes.`);
}

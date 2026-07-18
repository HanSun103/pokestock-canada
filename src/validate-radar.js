import { readFile } from "node:fs/promises";
import { WATCH_STAGES } from "./pipeline/state-engine.js";

const radar = JSON.parse(await readFile(new URL("../data/radar.json", import.meta.url), "utf8"));
const errors = [];
const ids = new Set();

if (!radar.meta?.generatedAt || Number.isNaN(Date.parse(radar.meta.generatedAt))) errors.push("radar.meta.generatedAt must be a timestamp");
if (!Array.isArray(radar.products)) errors.push("radar.products must be an array");
for (const [index, product] of (radar.products ?? []).entries()) {
  const path = `radar.products[${index}]`;
  if (!product.id || !product.name || !product.series) errors.push(`${path} identity fields are required`);
  if (ids.has(product.id)) errors.push(`${path}.id must be unique`);
  ids.add(product.id);
  if (!WATCH_STAGES.includes(product.watchStage)) errors.push(`${path}.watchStage is unsupported`);
  for (const dimension of ["existence", "canada", "timing"]) {
    if (!Number.isFinite(product.evidenceStrength?.[dimension]) || product.evidenceStrength[dimension] < 0 || product.evidenceStrength[dimension] > 1) errors.push(`${path}.evidenceStrength.${dimension} must be between 0 and 1`);
    if (!["low", "medium", "high"].includes(product.evidenceLabels?.[dimension])) errors.push(`${path}.evidenceLabels.${dimension} is unsupported`);
    if (!product.evidenceExplanations?.[dimension]) errors.push(`${path}.evidenceExplanations.${dimension} is required`);
  }
  if (!Array.isArray(product.evidence) || product.evidence.length === 0) errors.push(`${path}.evidence cannot be empty`);
  if (!Array.isArray(product.history) || product.history.length === 0) errors.push(`${path}.history cannot be empty`);
  if (!product.outlook?.conclusion || !product.outlook?.recommendation || !product.outlook?.rationale) errors.push(`${path}.outlook conclusion, recommendation, and rationale are required`);
  for (const field of ["windowStart", "windowEnd"]) {
    const value = product.outlook?.[field];
    if (value !== null && value !== undefined && (typeof value !== "string" || Number.isNaN(Date.parse(`${value}T00:00:00Z`)))) errors.push(`${path}.outlook.${field} must be a date or null`);
  }
  if (product.outlook?.windowStart && product.outlook?.windowEnd && product.outlook.windowEnd < product.outlook.windowStart) errors.push(`${path}.outlook window end cannot precede its start`);
}

if (errors.length) {
  console.error(`Radar validation failed:\n- ${errors.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Radar valid: ${radar.products.length} watched products, generated ${radar.meta.generatedAt}`);
}

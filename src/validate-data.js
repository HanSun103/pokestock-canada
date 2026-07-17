import { readFile } from "node:fs/promises";

const catalogUrl = new URL("../data/products.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));
const errors = [];
const ids = new Set();
const allowedTypes = new Set(["collection", "elite-trainer-box", "tin", "booster-bundle", "booster-box", "other"]);

if (!catalog.meta?.updatedAt || Number.isNaN(Date.parse(catalog.meta.updatedAt))) {
  errors.push("meta.updatedAt must be a valid timestamp");
}

if (!Array.isArray(catalog.products) || catalog.products.length === 0) {
  errors.push("products must be a non-empty array");
}

for (const [index, product] of (catalog.products ?? []).entries()) {
  const path = `products[${index}]`;
  for (const field of ["id", "name", "series", "type", "releaseDate", "summary", "canadaStatus", "canadaNote", "verifiedAt"]) {
    if (!product[field]) errors.push(`${path}.${field} is required`);
  }
  if (ids.has(product.id)) errors.push(`${path}.id must be unique`);
  ids.add(product.id);
  if (!allowedTypes.has(product.type)) errors.push(`${path}.type is not supported`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(product.releaseDate ?? "") || Number.isNaN(Date.parse(`${product.releaseDate}T00:00:00Z`))) {
    errors.push(`${path}.releaseDate must be YYYY-MM-DD`);
  }
  if (!product.source?.title || !product.source?.publisher) errors.push(`${path}.source title and publisher are required`);
  try {
    const url = new URL(product.source?.url);
    if (url.protocol !== "https:") errors.push(`${path}.source.url must use HTTPS`);
  } catch {
    errors.push(`${path}.source.url must be a valid URL`);
  }
  if (Number.isNaN(Date.parse(product.verifiedAt ?? ""))) errors.push(`${path}.verifiedAt must be a valid timestamp`);
  if (product.msrpCad !== null && (!Number.isFinite(product.msrpCad) || product.msrpCad <= 0)) {
    errors.push(`${path}.msrpCad must be null or a positive number`);
  }
  if (!Array.isArray(product.contents) || !Array.isArray(product.offers)) {
    errors.push(`${path}.contents and offers must be arrays`);
  }
}

if (errors.length) {
  console.error(`Catalog validation failed:\n- ${errors.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Catalog valid: ${catalog.products.length} products, updated ${catalog.meta.updatedAt}`);
}

import { createHash } from "node:crypto";

const IGNORED_PRODUCT_TERMS = new Set(["pokemon", "tcg"]);
const NEGATIVE_AVAILABILITY = /\b(not yet live|coming soon|unavailable|sold out|out of stock)\b/i;
const AVAILABILITY_LANGUAGE = /\b(pre[- ]?order|in stock|available now|live|restock(?:ed)?)\b/i;

function tokens(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? [];
}

function matchesKnownProduct(publication, product) {
  const haystack = new Set(tokens(`${publication.title} ${publication.text}`));
  const required = tokens(product.name).filter((term) => !IGNORED_PRODUCT_TERMS.has(term));
  return required.length >= 2 && required.every((term) => haystack.has(term));
}

function leadId(publication, product) {
  return createHash("sha256")
    .update(`${publication.id}\0${publication.url}\0${product.id}`)
    .digest("hex")
    .slice(0, 24);
}

export function extractKnownProductLeads(publications, knownProducts, source) {
  const leads = [];
  for (const publication of publications) {
    if (!publication.publishedAt || !publication.url) continue;
    const text = `${publication.title} ${publication.text}`;
    for (const product of knownProducts) {
      if (!matchesKnownProduct(publication, product)) continue;
      const canadianLead = source.region === "ca";
      leads.push({
        id: `lead-${leadId(publication, product)}`,
        eventType: "product-confirmed",
        publishedAt: publication.publishedAt,
        publicationTimePrecision: publication.publicationTimePrecision ?? "exact",
        discoveredAt: publication.discoveredAt,
        title: `${product.name} mentioned by ${source.name}`,
        url: publication.url,
        region: source.region ?? "unknown",
        product,
        facts: [
          `A public ${canadianLead ? "Canadian " : ""}discovery feed mentioned this known product.`,
          `This is an unverified lead${AVAILABILITY_LANGUAGE.test(text) && !NEGATIVE_AVAILABILITY.test(text) ? " that mentions availability" : ""}; it does not change the product's watch stage or confirm that Canadian stock is live.`,
        ],
        expectedAction: "Verify the linked report against a dated Canadian retailer observation before sending a Live now alert.",
      });
    }
  }
  return leads;
}

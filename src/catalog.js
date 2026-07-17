export const FAIR_PRICE_THRESHOLDS = Object.freeze({ atReference: 1.03, closeToReference: 1.1 });

export function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysUntil(releaseDate, now = new Date()) {
  const millisecondsPerDay = 86_400_000;
  return Math.ceil((parseLocalDate(releaseDate) - startOfDay(now)) / millisecondsPerDay);
}

export function getReleaseState(releaseDate, now = new Date(), archiveAfterDays = 180) {
  const days = daysUntil(releaseDate, now);
  if (days > 0) return "upcoming";
  if (days >= -archiveAfterDays) return "released";
  return "archived";
}

export function getCountdownLabel(releaseDate, now = new Date()) {
  const days = daysUntil(releaseDate, now);
  if (days > 1) return `${days} days to go`;
  if (days === 1) return "Tomorrow";
  if (days === 0) return "Releases today";
  if (days === -1) return "Released yesterday";
  return `Released ${Math.abs(days)} days ago`;
}

export function classifyPrice(offerPriceCad, referencePriceCad) {
  if (!Number.isFinite(offerPriceCad) || !Number.isFinite(referencePriceCad) || referencePriceCad <= 0) {
    return { key: "unknown", label: "Price not verified" };
  }

  const ratio = offerPriceCad / referencePriceCad;
  if (ratio <= FAIR_PRICE_THRESHOLDS.atReference) return { key: "at-reference", label: "At reference" };
  if (ratio <= FAIR_PRICE_THRESHOLDS.closeToReference) return { key: "close", label: "Close to reference" };
  return { key: "above", label: "Above reference" };
}

export function filterProducts(products, filters, now = new Date()) {
  const term = filters.search.trim().toLocaleLowerCase("en-CA");

  return products.filter((product) => {
    const stateMatches = filters.state === "all" || getReleaseState(product.releaseDate, now) === filters.state;
    const typeMatches = filters.type === "all" || product.type === filters.type;
    const searchable = `${product.name} ${product.series} ${product.summary}`.toLocaleLowerCase("en-CA");
    return stateMatches && typeMatches && (!term || searchable.includes(term));
  });
}

export function sortByReleaseDate(products) {
  return [...products].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
}

export function formatCad(value) {
  if (!Number.isFinite(value)) return "Not published";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(value);
}

export function formatDate(value) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "long", day: "numeric" }).format(parseLocalDate(value));
}

import {
  filterProducts,
  formatCad,
  formatDate,
  getAvailabilityLabel,
  getCountdownLabel,
  sortByReleaseDate,
} from "./catalog.js";

const TYPE_LABELS = {
  collection: "Collection",
  "elite-trainer-box": "Elite Trainer Box",
  tin: "Tin",
  "booster-bundle": "Booster Bundle",
  "booster-box": "Booster Box",
  other: "Other",
};

const WATCH_STAGE_LABELS = {
  "early-watch": "Early watch",
  "product-confirmed": "Product confirmed",
  prepare: "Prepare",
  "live-now": "Live now",
  "sold-out": "Sold out · Restock watch",
};

const state = {
  products: [],
  radar: [],
  meta: null,
  filters: { search: "", availability: "all", type: "all" },
  watchedOnly: false,
  watchlist: loadWatchlist(),
};

const elements = {
  grid: document.querySelector("#product-grid"),
  template: document.querySelector("#product-template"),
  search: document.querySelector("#search"),
  availabilityFilter: document.querySelector("#availability-filter"),
  typeFilter: document.querySelector("#type-filter"),
  clearFilters: document.querySelector("#clear-filters"),
  emptyClear: document.querySelector("#empty-clear"),
  empty: document.querySelector("#empty-state"),
  error: document.querySelector("#error-state"),
  summary: document.querySelector("#results-summary"),
  watchCount: document.querySelector("#watch-count"),
  watchToggle: document.querySelector("#watchlist-toggle"),
  showWatchlist: document.querySelector("#show-watchlist"),
  radarGrid: document.querySelector("#radar-grid"),
  radarTemplate: document.querySelector("#radar-template"),
};

function loadWatchlist() {
  try {
    const parsed = JSON.parse(localStorage.getItem("pokestock-watchlist") ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveWatchlist() {
  localStorage.setItem("pokestock-watchlist", JSON.stringify([...state.watchlist]));
}

function escapeText(value) {
  return String(value ?? "");
}

function setText(root, selector, value) {
  root.querySelector(selector).textContent = escapeText(value);
}

function setupTypes() {
  const types = [...new Set(state.products.map((product) => product.type))].sort();
  for (const type of types) {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = TYPE_LABELS[type] ?? type;
    elements.typeFilter.append(option);
  }
}

function percent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "—";
}

function renderRadar() {
  if (!elements.radarGrid || !elements.radarTemplate) return;
  const cards = state.radar.map((product) => {
    const fragment = elements.radarTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".radar-card");
    const stage = card.querySelector(".watch-stage");
    stage.textContent = WATCH_STAGE_LABELS[product.watchStage] ?? product.watchStage;
    stage.classList.add(product.watchStage);
    setText(card, ".radar-changed", `Changed ${formatDate(product.stateChangedAt.slice(0, 10))}`);
    setText(card, ".radar-series", product.series);
    setText(card, ".radar-name", product.name);
    setText(card, ".radar-reason", product.reason);
    setText(card, ".confidence-existence", percent(product.confidence.existence));
    setText(card, ".confidence-canada", percent(product.confidence.canada));
    setText(card, ".confidence-timing", percent(product.confidence.timing));
    const evidenceList = card.querySelector(".evidence-list");
    for (const event of product.history) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      const evidence = product.evidence.find((entry) => entry.signalId === event.signalId);
      link.href = evidence?.url ?? "#";
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = `${formatDate(event.at.slice(0, 10))} · ${WATCH_STAGE_LABELS[event.stage] ?? event.stage}`;
      const explanation = document.createElement("span");
      explanation.textContent = event.reason;
      item.append(link, explanation);
      evidenceList.append(item);
    }
    return fragment;
  });
  elements.radarGrid.replaceChildren(...cards);
}

function updateWatchControls() {
  elements.watchCount.textContent = state.watchlist.size;
  elements.showWatchlist.classList.toggle("active", state.watchedOnly);
  elements.showWatchlist.textContent = state.watchedOnly ? "Showing watched · Show all" : "Show watched only";
  elements.watchToggle.setAttribute("aria-pressed", String(state.watchedOnly));
}

function toggleWatch(productId) {
  if (state.watchlist.has(productId)) state.watchlist.delete(productId);
  else state.watchlist.add(productId);
  saveWatchlist();
  render();
}

function createCard(product) {
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector(".product-card");
  const availability = product.storefront.status;
  const watched = state.watchlist.has(product.id);

  card.id = `product-${product.id}`;
  setText(card, ".product-type-badge", TYPE_LABELS[product.type] ?? product.type);
  const stateBadge = card.querySelector(".state-badge");
  stateBadge.textContent = getAvailabilityLabel(availability);
  stateBadge.classList.add(availability);
  setText(card, ".product-series", product.series);
  setText(card, ".product-name", product.name);
  setText(card, ".product-summary", product.summary);
  setText(card, ".product-date", product.storefront.firstSeenAt ? `Listed ${formatDate(product.storefront.firstSeenAt)}` : formatDate(product.releaseDate));
  setText(card, ".product-countdown", product.storefront.firstSeenAt && product.releaseDate ? `Official release: ${formatDate(product.releaseDate)}` : getCountdownLabel(product.releaseDate));
  setText(card, ".product-price", formatCad(product.storefront.priceCad));
  const priceStatus = card.querySelector(".price-status");
  priceStatus.textContent = Number.isFinite(product.storefront.priceCad) ? "Pokémon Center Canada" : "Price not observed";
  setText(card, ".canada-note", product.canadaNote);
  setText(card, ".verified-line", product.storefront.checkedAt ? `Canada status checked ${formatDate(product.storefront.checkedAt)} · Dated observation` : `Product source verified ${formatDate(product.verifiedAt)} · Storefront not checked`);

  const sourceLink = card.querySelector(".source-link");
  sourceLink.href = product.storefront.url ?? product.source.url;
  sourceLink.textContent = product.storefront.checkedAt ? "Check Canadian store ↗" : "Official product source ↗";
  sourceLink.setAttribute("aria-label", `Open source for ${product.name} in a new tab`);

  const watchButton = card.querySelector(".watch-button");
  watchButton.classList.toggle("watched", watched);
  watchButton.setAttribute("aria-pressed", String(watched));
  watchButton.innerHTML = watched ? '<span aria-hidden="true">✓</span> Watching' : '<span aria-hidden="true">＋</span> Watch';
  watchButton.addEventListener("click", () => toggleWatch(product.id));
  return fragment;
}

function render() {
  let products = filterProducts(state.products, state.filters);
  if (state.watchedOnly) products = products.filter((product) => state.watchlist.has(product.id));
  products = sortByReleaseDate(products);

  elements.grid.replaceChildren(...products.map(createCard));
  elements.summary.textContent = `${products.length} of ${state.products.length} verified releases shown`;
  elements.empty.hidden = products.length > 0;
  elements.grid.hidden = products.length === 0;
  updateWatchControls();
}

function clearFilters() {
  state.filters = { search: "", availability: "all", type: "all" };
  state.watchedOnly = false;
  elements.search.value = "";
  elements.availabilityFilter.value = "all";
  elements.typeFilter.value = "all";
  render();
}

function setupHero() {
  const observed = sortByReleaseDate(state.products.filter((product) => product.storefront.firstSeenAt));
  const next = observed[0] ?? sortByReleaseDate(state.products)[0];
  if (!next) return;

  document.querySelector("#next-release-name").textContent = next.name;
  document.querySelector("#next-release-series").textContent = next.series;
  document.querySelector("#next-release-date").textContent = formatDate(next.storefront.firstSeenAt);
  document.querySelector("#next-release-countdown").textContent = `${getAvailabilityLabel(next.storefront.status)} · ${formatCad(next.storefront.priceCad)}`;
  document.querySelector("#next-release-link").href = `#product-${next.id}`;
  const observedCount = state.products.filter((product) => product.storefront.checkedAt).length;
  const soldOutCount = state.products.filter((product) => product.storefront.status === "sold-out").length;
  document.querySelector("#verified-count").textContent = `${observedCount} Canadian storefront records`;
  document.querySelector("#sold-out-count").textContent = `${soldOutCount} observed sold out`;
  document.querySelector("#catalog-updated").textContent = `Snapshot checked ${formatDate(state.meta.storefrontCheckedAt)}`;
}

function setupEvents() {
  elements.search.addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    render();
  });
  elements.availabilityFilter.addEventListener("change", (event) => {
    state.filters.availability = event.target.value;
    render();
  });
  elements.typeFilter.addEventListener("change", (event) => {
    state.filters.type = event.target.value;
    render();
  });
  elements.clearFilters.addEventListener("click", clearFilters);
  elements.emptyClear.addEventListener("click", clearFilters);
  elements.showWatchlist.addEventListener("click", () => {
    state.watchedOnly = !state.watchedOnly;
    render();
  });
  elements.watchToggle.addEventListener("click", () => {
    state.watchedOnly = !state.watchedOnly;
    document.querySelector("#catalog").scrollIntoView();
    render();
  });
}

async function init() {
  setupEvents();
  try {
    const [catalogResponse, radarResponse] = await Promise.all([fetch("data/products.json"), fetch("data/radar.json")]);
    if (!catalogResponse.ok) throw new Error(`Catalog request failed: ${catalogResponse.status}`);
    const catalog = await catalogResponse.json();
    const radar = radarResponse.ok ? await radarResponse.json() : { products: [] };
    state.products = catalog.products;
    state.meta = catalog.meta;
    state.radar = radar.products;
    setupTypes();
    setupHero();
    renderRadar();
    render();
  } catch (error) {
    console.error(error);
    elements.grid.hidden = true;
    elements.error.hidden = false;
    elements.summary.textContent = "Catalog unavailable";
  }
}

init();

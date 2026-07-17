import {
  classifyPrice,
  filterProducts,
  formatCad,
  formatDate,
  getCountdownLabel,
  getReleaseState,
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

const state = {
  products: [],
  meta: null,
  filters: { search: "", state: "all", type: "all" },
  watchedOnly: false,
  watchlist: loadWatchlist(),
};

const elements = {
  grid: document.querySelector("#product-grid"),
  template: document.querySelector("#product-template"),
  search: document.querySelector("#search"),
  stateFilter: document.querySelector("#state-filter"),
  typeFilter: document.querySelector("#type-filter"),
  clearFilters: document.querySelector("#clear-filters"),
  emptyClear: document.querySelector("#empty-clear"),
  empty: document.querySelector("#empty-state"),
  error: document.querySelector("#error-state"),
  summary: document.querySelector("#results-summary"),
  watchCount: document.querySelector("#watch-count"),
  watchToggle: document.querySelector("#watchlist-toggle"),
  showWatchlist: document.querySelector("#show-watchlist"),
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
  const releaseState = getReleaseState(product.releaseDate);
  const priceState = classifyPrice(product.offers[0]?.priceCad, product.msrpCad);
  const watched = state.watchlist.has(product.id);

  card.id = `product-${product.id}`;
  setText(card, ".product-type-badge", TYPE_LABELS[product.type] ?? product.type);
  const stateBadge = card.querySelector(".state-badge");
  stateBadge.textContent = releaseState;
  stateBadge.classList.add(releaseState);
  setText(card, ".product-series", product.series);
  setText(card, ".product-name", product.name);
  setText(card, ".product-summary", product.summary);
  setText(card, ".product-date", formatDate(product.releaseDate));
  setText(card, ".product-countdown", getCountdownLabel(product.releaseDate));
  setText(card, ".product-price", formatCad(product.msrpCad));
  const priceStatus = card.querySelector(".price-status");
  priceStatus.textContent = priceState.label;
  priceStatus.classList.add(priceState.key);
  setText(card, ".canada-note", product.canadaNote);
  setText(card, ".verified-line", `Source verified ${new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(new Date(product.verifiedAt))}`);

  const sourceLink = card.querySelector(".source-link");
  sourceLink.href = product.source.url;
  sourceLink.setAttribute("aria-label", `Open official source for ${product.name} in a new tab`);

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
  state.filters = { search: "", state: "all", type: "all" };
  state.watchedOnly = false;
  elements.search.value = "";
  elements.stateFilter.value = "all";
  elements.typeFilter.value = "all";
  render();
}

function setupHero() {
  const upcoming = sortByReleaseDate(state.products.filter((product) => getReleaseState(product.releaseDate) === "upcoming"));
  const next = upcoming[0] ?? sortByReleaseDate(state.products).at(-1);
  if (!next) return;

  document.querySelector("#next-release-name").textContent = next.name;
  document.querySelector("#next-release-series").textContent = next.series;
  document.querySelector("#next-release-date").textContent = formatDate(next.releaseDate);
  document.querySelector("#next-release-countdown").textContent = getCountdownLabel(next.releaseDate);
  document.querySelector("#next-release-link").href = `#product-${next.id}`;
  document.querySelector("#verified-count").textContent = `${state.products.length} verified releases`;
  document.querySelector("#catalog-updated").textContent = `Updated ${new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(state.meta.updatedAt))}`;
}

function setupEvents() {
  elements.search.addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    render();
  });
  elements.stateFilter.addEventListener("change", (event) => {
    state.filters.state = event.target.value;
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
    const response = await fetch("data/products.json");
    if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
    const catalog = await response.json();
    state.products = catalog.products;
    state.meta = catalog.meta;
    setupTypes();
    setupHero();
    render();
  } catch (error) {
    console.error(error);
    elements.grid.hidden = true;
    elements.error.hidden = false;
    elements.summary.textContent = "Catalog unavailable";
  }
}

init();

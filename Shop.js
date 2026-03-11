const STORAGE_KEY = "eventmart_products_v1";
const METRICS_KEY = "eventmart_product_metrics_v1";
const API_CANDIDATES = ["http://localhost:4000/api/products", "http://localhost:4000/products"];

let PRODUCTS = [];
let selectedCat = "ALL";
let selectedSub = null;
let searchQuery = "";
let sortMode = "featured";
let activeProduct = null;

const grid = document.getElementById("productsGrid");
const resultsText = document.getElementById("resultsText");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const clearFiltersBtn = document.getElementById("clearFilters");
const allItemsBtn = document.getElementById("allItemsBtn");
const dynamicSidebarCategories = document.getElementById("dynamicSidebarCategories");

const msRow = document.getElementById("mostSellingRow");
const msLeft = document.getElementById("msLeft");
const msRight = document.getElementById("msRight");

const modalBackdrop = document.getElementById("modalBackdrop");
const modalClose = document.getElementById("modalClose");
const modalImg = document.getElementById("modalImg");
const modalTitle = document.getElementById("modalTitle");
const modalDesc = document.getElementById("modalDesc");
const modalTags = document.getElementById("modalTags");
const modalQuality = document.getElementById("modalQuality");
const modalPrices = document.getElementById("modalPrices");
const modalQty = document.getElementById("modalQty");
const buyNowBtn = document.getElementById("buyNow");
const addToCartBtn = document.getElementById("addToCart");
const cartMsg = document.getElementById("cartMsg");

function formatMoney(value, currency = "USD") {
  if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2
  }).format(Number(value));
}

function toNum(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
}

function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => {
    if (c === "&") return "&amp;";
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === '"') return "&quot;";
    return "&#39;";
  });
}

function fallbackImage(name) {
  return `https://placehold.co/520x360?text=${encodeURIComponent(name || "EventMart")}`;
}

function fallbackProductId(id) {
  const clean = String(id ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (clean) return `P-${clean.slice(-5).padStart(5, "0")}`;
  return `P-${Date.now().toString().slice(-5)}`;
}

function getMode(product) {
  if (product.buy_enabled && product.rent_enabled) return "BOTH";
  if (product.buy_enabled) return "BUY_ONLY";
  if (product.rent_enabled) return "RENT_ONLY";
  return "NONE";
}

function getStartingPrice(product) {
  if (product.buy_enabled && product.buy_price !== null) return Number(product.buy_price);
  if (product.rent_enabled && product.rent_price_per_day !== null) return Number(product.rent_price_per_day);
  return 0;
}

function storageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_error) {
    return fallback;
  }
}

function storageSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function toLocalProduct(p) {
  const localId = String(p.id);
  return {
    id: localId,
    product_id: String(p.product_id || fallbackProductId(localId)),
    name: String(p.name || "Unnamed Product"),
    category: String(p.category || "General"),
    subcategory: String(p.subcategory || "General"),
    image_url: p.image_url || "",
    description: String(p.description || ""),
    quality_points: Array.isArray(p.quality_points) ? p.quality_points : [],
    buy_enabled: Boolean(p.buy_enabled),
    rent_enabled: Boolean(p.rent_enabled),
    buy_price: toNum(p.buy_price, null),
    rent_price_per_day: toNum(p.rent_price_per_day, null),
    currency: String(p.currency || "USD"),
    active: p.active !== false,
    quantity_available: toNum(p.quantity_available, 0)
  };
}

function mapApiProduct(row) {
  return toLocalProduct({
    id: row.id,
    product_id: row.product_id,
    name: row.name,
    category: row.category,
    subcategory: row.subcategory,
    image_url: row.image_url,
    description: row.description,
    quality_points: row.quality_points,
    buy_enabled: row.buy_enabled,
    rent_enabled: row.rent_enabled,
    buy_price: row.buy_price,
    rent_price_per_day: row.rent_price_per_day,
    currency: row.currency,
    active: row.active,
    quantity_available: row.quantity_available
  });
}

async function loadProducts() {
  const localProducts = storageGet(STORAGE_KEY, []);
  if (Array.isArray(localProducts) && localProducts.length > 0) {
    PRODUCTS = localProducts.map(toLocalProduct).filter((p) => p.active !== false);
    return;
  }

  for (const url of API_CANDIDATES) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const rows = await res.json();
      if (!Array.isArray(rows)) continue;
      const mapped = rows.map(mapApiProduct);
      PRODUCTS = mapped.filter((p) => p.active !== false);
      storageSet(STORAGE_KEY, mapped);
      return;
    } catch (_error) {
      // Try next route.
    }
  }

  PRODUCTS = [];
}

function getMetricsMap() {
  return storageGet(METRICS_KEY, {});
}

function bumpMetric(productId, metric, qty = 1) {
  if (!productId) return;
  const metrics = getMetricsMap();
  if (!metrics[productId]) metrics[productId] = {};
  metrics[productId][metric] = Number(metrics[productId][metric] || 0) + Number(qty || 1);
  storageSet(METRICS_KEY, metrics);
}

function getProductMetric(productId, metric) {
  const metrics = getMetricsMap();
  return Number(metrics?.[productId]?.[metric] || 0);
}

function buildCategoryModel(products) {
  const map = new Map();

  products.forEach((p) => {
    const cat = p.category.trim() || "General";
    const sub = p.subcategory.trim() || "General";

    if (!map.has(cat)) map.set(cat, new Set());
    map.get(cat).add(sub);
  });

  return Array.from(map.entries())
    .map(([category, subSet]) => ({ category, subcategories: Array.from(subSet).sort() }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

function applyInitialCategoryFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const requestedCategory = params.get("category");
  if (!requestedCategory) return;

  const exists = PRODUCTS.some((p) => p.active !== false && p.category === requestedCategory);
  if (exists) {
    selectedCat = requestedCategory;
    selectedSub = null;
  }
}

function ensureFilterStateIsValid() {
  if (selectedCat !== "ALL") {
    const catExists = PRODUCTS.some((p) => p.active !== false && p.category === selectedCat);
    if (!catExists) {
      selectedCat = "ALL";
      selectedSub = null;
    }
  }

  if (selectedSub) {
    const subExists = PRODUCTS.some(
      (p) => p.active !== false && p.category === selectedCat && p.subcategory === selectedSub
    );
    if (!subExists) selectedSub = null;
  }
}

function renderSidebarCategories() {
  if (!dynamicSidebarCategories) return;

  const categories = buildCategoryModel(PRODUCTS);

  if (!categories.length) {
    dynamicSidebarCategories.innerHTML = "<p class='muted'>No categories yet.</p>";
    return;
  }

  dynamicSidebarCategories.innerHTML = categories
    .map(
      (group) => `
        <details class="category-group" open>
          <summary>
            <button class="cat-btn" data-cat="${safeText(group.category)}" type="button">${safeText(group.category)}</button>
          </summary>
          <div class="subcats">
            ${group.subcategories
              .map(
                (sub) =>
                  `<button class="sub-btn" data-cat="${safeText(group.category)}" data-sub="${safeText(sub)}" type="button">${safeText(sub)}</button>`
              )
              .join("")}
          </div>
        </details>
      `
    )
    .join("");

  dynamicSidebarCategories.querySelectorAll(".cat-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedCat = btn.dataset.cat;
      selectedSub = null;
      updateFilterButtonState();
      render();
    });
  });

  dynamicSidebarCategories.querySelectorAll(".sub-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedCat = btn.dataset.cat;
      selectedSub = btn.dataset.sub;
      updateFilterButtonState();
      render();
    });
  });

  updateFilterButtonState();
}

function updateFilterButtonState() {
  allItemsBtn?.classList.toggle("active", selectedCat === "ALL");

  dynamicSidebarCategories?.querySelectorAll(".cat-btn").forEach((btn) => {
    btn.classList.toggle("active", selectedSub === null && selectedCat === btn.dataset.cat);
  });

  dynamicSidebarCategories?.querySelectorAll(".sub-btn").forEach((btn) => {
    const isActive = selectedCat === btn.dataset.cat && selectedSub === btn.dataset.sub;
    btn.classList.toggle("active", isActive);
  });
}

function matchesFilters(product) {
  const catOk = selectedCat === "ALL" || product.category === selectedCat;
  const subOk = !selectedSub || product.subcategory === selectedSub;

  const q = searchQuery.trim().toLowerCase();
  const searchOk =
    !q ||
    product.name.toLowerCase().includes(q) ||
    String(product.product_id || "").toLowerCase().includes(q) ||
    product.description.toLowerCase().includes(q) ||
    product.category.toLowerCase().includes(q) ||
    product.subcategory.toLowerCase().includes(q);

  return catOk && subOk && searchOk;
}

function applySort(list) {
  const arr = [...list];

  if (sortMode === "low") {
    arr.sort((a, b) => getStartingPrice(a) - getStartingPrice(b));
  } else if (sortMode === "high") {
    arr.sort((a, b) => getStartingPrice(b) - getStartingPrice(a));
  } else if (sortMode === "name") {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    arr.sort((a, b) => {
      const scoreA = getProductMetric(a.id, "purchase") * 5 + getProductMetric(a.id, "add_to_cart") * 2 + getProductMetric(a.id, "product_view");
      const scoreB = getProductMetric(b.id, "purchase") * 5 + getProductMetric(b.id, "add_to_cart") * 2 + getProductMetric(b.id, "product_view");
      return scoreB - scoreA;
    });
  }

  return arr;
}

function getFilteredProducts() {
  return applySort(PRODUCTS.filter((p) => p.active !== false).filter(matchesFilters));
}

function render() {
  if (!grid || !resultsText) return;

  ensureFilterStateIsValid();
  const filtered = getFilteredProducts();

  let label = "Showing all items";
  if (selectedCat !== "ALL") label = `Category: ${selectedCat}`;
  if (selectedSub) label += ` | ${selectedSub}`;
  if (searchQuery.trim()) label += ` | Search: \"${searchQuery.trim()}\"`;
  label += ` | ${filtered.length} result(s)`;

  resultsText.textContent = label;

  if (!filtered.length) {
    grid.innerHTML = `
      <article class="product-card">
        <h3>No items found</h3>
        <p class="muted">Try a different filter or add products from Admin.</p>
      </article>
    `;
    return;
  }

  grid.innerHTML = "";
  filtered.forEach((p) => grid.appendChild(productCard(p)));
}

function productCard(p) {
  const card = document.createElement("article");
  card.className = "product-card";

  const buyExists = p.buy_enabled && p.buy_price !== null;
  const rentExists = p.rent_enabled && p.rent_price_per_day !== null;

  card.innerHTML = `
    <img src="${safeText(p.image_url || fallbackImage(p.name))}" alt="${safeText(p.name)}">
    <h3>${safeText(p.name)}</h3>
    <div class="product-code">ID: ${safeText(p.product_id || "-")}</div>
    <div class="price-start">Starting from ${safeText(formatMoney(getStartingPrice(p), p.currency))}</div>

    <div class="price-row">
      ${buyExists ? `<div class="price-chip">${safeText(formatMoney(p.buy_price, p.currency))}<small>buy</small></div>` : ""}
      ${rentExists ? `<div class="price-chip">${safeText(formatMoney(p.rent_price_per_day, p.currency))}<small>/day rent</small></div>` : ""}
    </div>

    <div class="actions">
      ${buyExists ? `<button class="btn primary" data-action="buy" type="button">Buy</button>` : ""}
      ${rentExists ? `<button class="btn" data-action="rent" type="button">Rent</button>` : ""}
      <button class="btn ghost" data-action="details" type="button">Details</button>
    </div>
  `;

  card.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => openModal(p, btn.dataset.action));
  });

  return card;
}

function renderMostSelling() {
  if (!msRow) return;

  const items = [...PRODUCTS]
    .filter((p) => p.active !== false)
    .sort((a, b) => getProductMetric(b.id, "purchase") - getProductMetric(a.id, "purchase"))
    .slice(0, 10);

  msRow.innerHTML = "";

  if (!items.length) {
    msRow.innerHTML = `
      <article class="product-card">
        <h3>No sales data yet</h3>
        <p class="muted">Products appear here after interactions in shop.</p>
      </article>
    `;
    return;
  }

  items.forEach((p) => {
    const card = productCard(p);
    msRow.appendChild(card);
  });
}

function openModal(product, action = "details") {
  activeProduct = product;
  bumpMetric(product.id, "product_view", 1);

  modalImg.src = product.image_url || fallbackImage(product.name);
  modalTitle.textContent = product.name;
  modalDesc.textContent = product.description || "No description provided.";

  modalTags.innerHTML = "";
  [product.category, product.subcategory, getMode(product), `Stock: ${product.quantity_available}`].forEach((tagText) => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = tagText;
    modalTags.appendChild(tag);
  });

  const idTag = document.createElement("span");
  idTag.className = "tag";
  idTag.textContent = `ID: ${product.product_id || "-"}`;
  modalTags.appendChild(idTag);

  modalQuality.innerHTML = "";
  const quality = Array.isArray(product.quality_points) && product.quality_points.length
    ? product.quality_points
    : ["No quality points added yet."];

  quality.forEach((point) => {
    const li = document.createElement("li");
    li.textContent = point;
    modalQuality.appendChild(li);
  });

  modalPrices.innerHTML = "";
  if (product.buy_enabled && product.buy_price !== null) {
    const buyRow = document.createElement("div");
    buyRow.className = "modal-price";
    buyRow.innerHTML = `<span>${safeText(formatMoney(product.buy_price, product.currency))} <small>buy</small></span><small>one-time</small>`;
    modalPrices.appendChild(buyRow);
  }
  if (product.rent_enabled && product.rent_price_per_day !== null) {
    const rentRow = document.createElement("div");
    rentRow.className = "modal-price";
    rentRow.innerHTML = `<span>${safeText(formatMoney(product.rent_price_per_day, product.currency))} <small>/day rent</small></span><small>per day</small>`;
    modalPrices.appendChild(rentRow);
  }

  modalQty.value = "1";
  modalQty.max = String(product.quantity_available > 0 ? product.quantity_available : 9999);
  cartMsg.textContent = "";

  if (action === "buy") {
    cartMsg.textContent = "Ready to buy this item.";
  } else if (action === "rent") {
    cartMsg.textContent = "Ready to rent this item.";
  }

  modalBackdrop.classList.add("show");
  modalBackdrop.setAttribute("aria-hidden", "false");

  renderMostSelling();
}

function closeModal() {
  modalBackdrop.classList.remove("show");
  modalBackdrop.setAttribute("aria-hidden", "true");
  activeProduct = null;
}

function handleCartAction(type) {
  if (!activeProduct) return;

  const qty = Math.max(1, Number(modalQty.value || 1));
  if (activeProduct.quantity_available > 0 && qty > activeProduct.quantity_available) {
    cartMsg.textContent = `Only ${activeProduct.quantity_available} item(s) available.`;
    return;
  }

  if (type === "buy") {
    bumpMetric(activeProduct.id, "purchase", qty);
    cartMsg.textContent = `Purchase confirmed: ${qty} x ${activeProduct.name}`;
  } else {
    bumpMetric(activeProduct.id, "add_to_cart", qty);
    cartMsg.textContent = `Added to cart: ${qty} x ${activeProduct.name}`;
  }

  renderMostSelling();
}

function bindEvents() {
  allItemsBtn?.addEventListener("click", () => {
    selectedCat = "ALL";
    selectedSub = null;
    updateFilterButtonState();
    render();
  });

  clearFiltersBtn?.addEventListener("click", () => {
    selectedCat = "ALL";
    selectedSub = null;
    searchQuery = "";
    sortMode = "featured";
    if (searchInput) searchInput.value = "";
    if (sortSelect) sortSelect.value = "featured";
    updateFilterButtonState();
    render();
  });

  searchInput?.addEventListener("input", () => {
    searchQuery = searchInput.value || "";
    render();
  });

  sortSelect?.addEventListener("change", () => {
    sortMode = sortSelect.value;
    render();
  });

  msLeft?.addEventListener("click", () => {
    msRow.scrollBy({ left: -340, behavior: "smooth" });
  });

  msRight?.addEventListener("click", () => {
    msRow.scrollBy({ left: 340, behavior: "smooth" });
  });

  modalClose?.addEventListener("click", closeModal);

  modalBackdrop?.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  addToCartBtn?.addEventListener("click", () => handleCartAction("cart"));
  buyNowBtn?.addEventListener("click", () => handleCartAction("buy"));

  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY || e.key === METRICS_KEY) {
      const products = storageGet(STORAGE_KEY, []).map(toLocalProduct);
      PRODUCTS = products.filter((p) => p.active !== false);
      ensureFilterStateIsValid();
      renderSidebarCategories();
      renderMostSelling();
      render();
    }
  });
}

async function init() {
  bindEvents();
  await loadProducts();
  applyInitialCategoryFromQuery();
  ensureFilterStateIsValid();
  renderSidebarCategories();
  renderMostSelling();
  render();
}

init();

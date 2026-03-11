(function () {
  const STORAGE_KEY = "eventmart_products_v1";
  const AUTH_STORAGE_KEY = "eventmart_auth_v1";
  const API_CANDIDATES = ["http://localhost:4000/api/products", "http://localhost:4000/products"];

  const navbar = document.querySelector(".navbar");
  if (navbar) {
    let lastY = window.scrollY || 0;
    let ticking = false;
    const delta = 8;

    function syncNavbarVisibility() {
      const currentY = window.scrollY || 0;
      const movedEnough = Math.abs(currentY - lastY) > delta;
      const goingDown = currentY > lastY;
      const pastTop = currentY > (navbar.offsetHeight + 10);

      if (movedEnough) {
        if (goingDown && pastTop) {
          navbar.classList.add("navbar-hidden");
        } else {
          navbar.classList.remove("navbar-hidden");
        }
      }

      lastY = currentY;
      ticking = false;
    }

    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          window.requestAnimationFrame(syncNavbarVisibility);
          ticking = true;
        }
      },
      { passive: true }
    );

    window.addEventListener("focusin", () => {
      navbar.classList.remove("navbar-hidden");
    });
  }

  function getAuthUser() {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.user || null;
    } catch (_error) {
      return null;
    }
  }

  function getFirstName(name) {
    return String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)[0] || "";
  }

  function renderAuthGreeting() {
    const regText = document.querySelector(".reg-text");
    if (!regText) return;

    const user = getAuthUser();
    const firstName = getFirstName(user?.name);

    if (firstName) {
      regText.textContent = `Welcome ${firstName}`;
      if (regText.tagName === "A") {
        regText.setAttribute("href", "Profile.html");
        regText.setAttribute("title", `Signed in as ${user.name}`);
      }
      return;
    }

    regText.textContent = "Register / Sign in";
    if (regText.tagName === "A") {
      regText.setAttribute("href", "RegisterSignIn.html");
      regText.removeAttribute("title");
    }
  }

  renderAuthGreeting();

  const menus = Array.from(document.querySelectorAll("[data-dynamic-shop-menu], #shopNavCategories"));
  if (!menus.length) {
    window.addEventListener("storage", (e) => {
      if (e.key === AUTH_STORAGE_KEY) {
        renderAuthGreeting();
      }
    });
    return;
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

  function normalizeProduct(row) {
    return {
      category: String(row?.category ?? "").trim(),
      active: row?.active !== false
    };
  }

  function uniqueSortedCategories(products) {
    const categories = new Set();
    products
      .map(normalizeProduct)
      .filter((p) => p.active && p.category)
      .forEach((p) => categories.add(p.category));

    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }

  function getLocalProducts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  async function getApiProducts() {
    for (const url of API_CANDIDATES) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const rows = await res.json();
        if (Array.isArray(rows)) return rows;
      } catch (_error) {
        // Try next endpoint.
      }
    }
    return [];
  }

  function buildMenuHtml(categories) {
    const base = ["<li><a href=\"Shop.html\">All Categories</a></li>"];

    categories.forEach((category) => {
      const href = `Shop.html?category=${encodeURIComponent(category)}`;
      base.push(`<li><a href=\"${href}\">${safeText(category)}</a></li>`);
    });

    return base.join("");
  }

  async function renderNavbarCategories() {
    let products = getLocalProducts();
    if (!products.length) products = await getApiProducts();

    const categories = uniqueSortedCategories(products);
    const html = buildMenuHtml(categories);
    menus.forEach((menu) => {
      menu.innerHTML = html;
    });
  }

  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      renderNavbarCategories();
    }
    if (e.key === AUTH_STORAGE_KEY) {
      renderAuthGreeting();
    }
  });

  renderNavbarCategories();
})();

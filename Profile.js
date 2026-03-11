(function () {
  const API_BASE_CANDIDATES = ["http://localhost:4000", "http://127.0.0.1:4000"];
  const AUTH_STORAGE_KEY = "eventmart_auth_v1";

  const welcomeName = document.getElementById("welcomeName");
  const ordersCount = document.getElementById("ordersCount");
  const ordersActive = document.getElementById("ordersActive");
  const ordersTotalSpent = document.getElementById("ordersTotalSpent");

  const profileForm = document.getElementById("profileForm");
  const fullNameInput = document.getElementById("fullName");
  const emailInput = document.getElementById("email");
  const currentPasswordInput = document.getElementById("currentPassword");
  const newPasswordInput = document.getElementById("newPassword");
  const confirmNewPasswordInput = document.getElementById("confirmNewPassword");
  const profileStatus = document.getElementById("profileStatus");
  const profileSaveBtn = document.getElementById("profileSaveBtn");

  const profileRole = document.getElementById("profileRole");
  const profileJoined = document.getElementById("profileJoined");
  const profileLastLogin = document.getElementById("profileLastLogin");

  const ordersList = document.getElementById("ordersList");
  const orderStatusFilter = document.getElementById("orderStatusFilter");
  const refreshOrdersBtn = document.getElementById("refreshOrdersBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  let session = getSession();
  let orders = [];

  function getSession() {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  }

  function saveSession(data) {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        token: data.token,
        user: data.user,
        saved_at: new Date().toISOString()
      })
    );
    session = getSession();
  }

  function clearSession() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    session = null;
  }

  function redirectToSignIn() {
    const returnTo = encodeURIComponent("Profile.html");
    window.location.href = `RegisterSignIn.html?returnTo=${returnTo}`;
  }

  function requireSession() {
    if (!session?.token || !session?.user) {
      redirectToSignIn();
      return false;
    }
    return true;
  }

  function setStatus(message, type = "info") {
    if (!profileStatus) return;
    profileStatus.textContent = message;
    profileStatus.classList.remove("success", "error");
    if (type === "success") profileStatus.classList.add("success");
    if (type === "error") profileStatus.classList.add("error");
  }

  function setButtonLoading(btn, loading, loadingText, defaultText) {
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? loadingText : defaultText;
  }

  function formatDateTime(value) {
    if (!value) return "Never";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return "Invalid date";
    return date.toLocaleString();
  }

  function formatMoney(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2
    }).format(amount);
  }

  function getFirstName(name) {
    return String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)[0] || "User";
  }

  function syncNavbarGreeting() {
    const regText = document.querySelector(".reg-text");
    if (!regText) return;
    if (session?.user?.name) {
      regText.textContent = `Welcome ${getFirstName(session.user.name)}`;
      regText.setAttribute("href", "Profile.html");
      regText.setAttribute("title", `Signed in as ${session.user.name}`);
    } else {
      regText.textContent = "Register / Sign in";
      regText.setAttribute("href", "RegisterSignIn.html");
      regText.removeAttribute("title");
    }
  }

  async function apiRequest(path, options = {}) {
    const token = session?.token || "";
    const method = options.method || "GET";
    const body = options.body || null;
    let lastError = "Unable to reach profile server.";

    for (const base of API_BASE_CANDIDATES) {
      const url = `${base}${path}`;
      try {
        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: body ? JSON.stringify(body) : undefined
        });

        const raw = await res.text();
        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (_parseError) {
          data = {};
        }

        if (!res.ok) {
          if (res.status === 401) {
            clearSession();
            redirectToSignIn();
            throw new Error("Session expired. Please sign in again.");
          }
          lastError = data.error || (raw && raw.length < 220 ? raw : `Request failed (${res.status})`);
          continue;
        }
        return data;
      } catch (_error) {
        if (_error && _error.message === "Session expired. Please sign in again.") {
          throw _error;
        }
        // Try next URL candidate.
      }
    }

    throw new Error(lastError);
  }

  function updateSnapshot(user) {
    welcomeName.textContent = `Welcome ${getFirstName(user.name)}`;
    fullNameInput.value = user.name || "";
    emailInput.value = user.email || "";
    profileRole.textContent = user.role || "customer";
    profileJoined.textContent = formatDateTime(user.created_at);
    profileLastLogin.textContent = formatDateTime(user.last_login_at);
  }

  function getStatusProgress(status) {
    const map = {
      pending: 15,
      confirmed: 30,
      processing: 50,
      shipped: 75,
      delivered: 100,
      completed: 100,
      cancelled: 100
    };
    return map[String(status || "").toLowerCase()] ?? 20;
  }

  function renderSummary() {
    const total = orders.length;
    const active = orders.filter((o) => !["delivered", "completed", "cancelled"].includes(String(o.status || "").toLowerCase())).length;
    const spent = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);

    ordersCount.textContent = String(total);
    ordersActive.textContent = String(active);
    ordersTotalSpent.textContent = formatMoney(spent);
  }

  function renderOrders() {
    const statusFilter = orderStatusFilter?.value || "all";
    const filtered = statusFilter === "all"
      ? orders
      : orders.filter((order) => String(order.status || "").toLowerCase() === statusFilter);

    if (!filtered.length) {
      ordersList.innerHTML = `<div class="orders-empty">No orders found for the selected filter.</div>`;
      return;
    }

    ordersList.innerHTML = filtered
      .map((order) => {
        const normalizedStatus = String(order.status || "pending").toLowerCase();
        const progress = getStatusProgress(normalizedStatus);
        return `
          <article class="order-card">
            <div class="order-head">
              <span class="order-id">Order #${order.id}</span>
              <span class="status-pill status-${normalizedStatus}">${normalizedStatus}</span>
            </div>
            <div class="order-meta">
              <span>Created: ${formatDateTime(order.created_at)}</span>
              <span>Items: ${Number(order.total_items || 0)}</span>
              <span>Total: ${formatMoney(order.total)}</span>
            </div>
            <div class="order-progress"><span style="width:${progress}%"></span></div>
          </article>
        `;
      })
      .join("");
  }

  async function loadProfile() {
    const payload = await apiRequest("/api/me");
    if (!payload?.user) throw new Error("Unable to load profile.");
    const nextToken = payload.token || session.token;
    saveSession({ token: nextToken, user: payload.user });
    syncNavbarGreeting();
    updateSnapshot(payload.user);
  }

  async function loadOrders() {
    const payload = await apiRequest("/api/me/orders");
    orders = Array.isArray(payload) ? payload : [];
    renderSummary();
    renderOrders();
  }

  async function submitProfileUpdate(event) {
    event.preventDefault();
    setButtonLoading(profileSaveBtn, true, "Saving...", "Save Changes");
    setStatus("Updating profile...");

    try {
      const name = fullNameInput.value.trim();
      const email = emailInput.value.trim().toLowerCase();
      const currentPassword = currentPasswordInput.value;
      const newPassword = newPasswordInput.value;
      const confirmNewPassword = confirmNewPasswordInput.value;

      if (!name || !email) {
        throw new Error("Name and email are required.");
      }

      if (newPassword || confirmNewPassword) {
        if (newPassword !== confirmNewPassword) {
          throw new Error("New password and confirmation do not match.");
        }
        if (!currentPassword) {
          throw new Error("Current password is required to set a new password.");
        }
      }

      const body = { name, email };
      if (newPassword) {
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }

      const payload = await apiRequest("/api/me", {
        method: "PUT",
        body
      });

      const nextToken = payload.token || session.token;
      saveSession({ token: nextToken, user: payload.user });
      syncNavbarGreeting();
      updateSnapshot(payload.user);

      currentPasswordInput.value = "";
      newPasswordInput.value = "";
      confirmNewPasswordInput.value = "";
      setStatus("Profile updated successfully.", "success");
    } catch (error) {
      setStatus(error.message || "Failed to update profile.", "error");
    } finally {
      setButtonLoading(profileSaveBtn, false, "Saving...", "Save Changes");
    }
  }

  function bindEvents() {
    profileForm?.addEventListener("submit", submitProfileUpdate);
    orderStatusFilter?.addEventListener("change", renderOrders);
    refreshOrdersBtn?.addEventListener("click", loadOrders);
    logoutBtn?.addEventListener("click", () => {
      clearSession();
      window.location.href = "RegisterSignIn.html";
    });
  }

  async function init() {
    if (!requireSession()) return;
    bindEvents();
    syncNavbarGreeting();
    try {
      await loadProfile();
      await loadOrders();
    } catch (error) {
      setStatus(error.message || "Failed to load profile.", "error");
    }
  }

  init();
})();

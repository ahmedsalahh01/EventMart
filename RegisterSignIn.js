(function () {
  const API_BASE_CANDIDATES = ["http://localhost:4000", "http://127.0.0.1:4000"];
  const AUTH_STORAGE_KEY = "eventmart_auth_v1";
  const requestedReturnTo = new URLSearchParams(window.location.search).get("returnTo") || "Landing.html";
  const returnTo = /^[a-zA-Z0-9_.-]+\.html$/.test(requestedReturnTo) ? requestedReturnTo : "Landing.html";

  const signInForm = document.getElementById("signInForm");
  const registerForm = document.getElementById("registerForm");
  const signInMode = document.getElementById("mode-signin");
  const registerMode = document.getElementById("mode-register");
  const authStatus = document.getElementById("authStatus");

  const signInEmail = document.getElementById("signInEmail");
  const signInPassword = document.getElementById("signInPassword");
  const registerName = document.getElementById("registerName");
  const registerEmail = document.getElementById("registerEmail");
  const registerPassword = document.getElementById("registerPassword");
  const registerConfirmPassword = document.getElementById("registerConfirmPassword");

  function setStatus(message, type = "info") {
    if (!authStatus) return;
    authStatus.textContent = message;
    authStatus.classList.remove("status-success", "status-error");
    if (type === "success") authStatus.classList.add("status-success");
    if (type === "error") authStatus.classList.add("status-error");
  }

  function setButtonLoading(button, isLoading, loadingText, defaultText) {
    if (!button) return;
    button.disabled = isLoading;
    button.textContent = isLoading ? loadingText : defaultText;
  }

  function saveAuthSession(payload) {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        token: payload.token,
        user: payload.user,
        saved_at: new Date().toISOString()
      })
    );
  }

  async function postJson(path, body) {
    let lastError = "Unable to reach authentication server.";

    for (const base of API_BASE_CANDIDATES) {
      const url = `${base}${path}`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        const rawText = await res.text();
        let data = {};
        try {
          data = rawText ? JSON.parse(rawText) : {};
        } catch (_parseError) {
          data = {};
        }

        if (!res.ok) {
          const fallback = rawText && rawText.length < 220 ? rawText : `Request failed (${res.status}).`;
          lastError = data.error || fallback;
          continue;
        }
        return data;
      } catch (_error) {
        // Try next candidate.
      }
    }

    throw new Error(lastError);
  }

  signInForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = signInForm.querySelector("button[type='submit']");
    setStatus("Signing in...");
    setButtonLoading(submitBtn, true, "Signing In...", "Sign In");

    try {
      const payload = await postJson("/api/auth/login", {
        email: signInEmail.value.trim(),
        password: signInPassword.value
      });
      saveAuthSession(payload);
      setStatus(`Welcome back, ${payload.user.name}! Redirecting...`, "success");
      window.setTimeout(() => {
        window.location.href = returnTo;
      }, 800);
    } catch (error) {
      setStatus(error.message || "Sign in failed.", "error");
    } finally {
      setButtonLoading(submitBtn, false, "Signing In...", "Sign In");
    }
  });

  registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = registerForm.querySelector("button[type='submit']");

    if (registerPassword.value !== registerConfirmPassword.value) {
      setStatus("Passwords do not match.", "error");
      return;
    }

    setStatus("Creating your account...");
    setButtonLoading(submitBtn, true, "Creating...", "Create Account");

    try {
      const payload = await postJson("/api/auth/register", {
        name: registerName.value.trim(),
        email: registerEmail.value.trim(),
        password: registerPassword.value
      });
      saveAuthSession(payload);
      setStatus("Account created successfully. You can sign in anytime.", "success");
      registerForm.reset();
      signInMode.checked = true;
      signInEmail.value = payload.user.email;
      signInPassword.value = "";
    } catch (error) {
      setStatus(error.message || "Registration failed.", "error");
      registerMode.checked = true;
    } finally {
      setButtonLoading(submitBtn, false, "Creating...", "Create Account");
    }
  });
})();

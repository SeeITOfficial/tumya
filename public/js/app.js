import { Api } from "./api.js";
import { setupPush } from "./notifications/notifications.js";

import {
  renderHome,
  openProduct,
  closeProduct,
  openImageViewer,
  closeImageViewer,
  changeQty,
} from "./catalog/catalog.js";

import {
  addToCart,
  updateCartBadge,
  renderCartPage,
} from "./catalog/cart.js";

import {
  renderParcelForm,
  renderParcelStep,
  parcelWizard,
} from "./parcel/wizard.js";

import {
  renderOrders,
  openOrderDetail,
} from "./orders/orders.js";

import { renderAccount } from "./account/account.js";

// -----------------------------------------------------------------------------
// App State
// -----------------------------------------------------------------------------

let activeTab = "home";
let resendTimer = null;

const app = document.getElementById("app");

function trackCodeFromUrl() {
  return new URLSearchParams(location.search).get("track");
}

// -----------------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------------

async function boot() {
  if (!Api.token()) {
    renderLogin();
    return;
  }

  renderShell();

  const trackCode = trackCodeFromUrl();

  if (trackCode) {
    await goto("orders");
    await openOrderDetail(trackCode);
    return;
  }

  await goto("home");
}

// -----------------------------------------------------------------------------
// Login Screen
// -----------------------------------------------------------------------------

export function renderLogin() {
  clearInterval(resendTimer);

  app.innerHTML = `
    <div class="login-screen">

      <div class="login-hero">
        <img src="/icons/icon-192.png" class="login-logo" alt="Tumya Logo">
        <h1 class="login-title">Tumya</h1>

        <p class="login-tagline">
          Connecting India 🇮🇳 and Uganda 🇺🇬
        </p>

      </div>

      <div class="card login-card">

        <h2>Welcome</h2>

        <div class="login-tabs">
          <button id="tab-login" class="active">
            Sign In
          </button>

          <button id="tab-register">
            Create Account
          </button>
        </div>

        <div id="auth-form"></div>

      </div>

    </div>
  `;

  document
    .getElementById("tab-login")
    .addEventListener("click", renderLoginForm);

  document
    .getElementById("tab-register")
    .addEventListener("click", renderRegisterForm);

  renderLoginForm();
}

// -----------------------------------------------------------------------------
// Login / Register Forms
// -----------------------------------------------------------------------------

function activateTab(login) {
  document
    .getElementById("tab-login")
    .classList.toggle("active", login);

  document
    .getElementById("tab-register")
    .classList.toggle("active", !login);
}

function renderLoginForm() {
  activateTab(true);

  document.getElementById("auth-form").innerHTML = `
    <label>Email Address</label>

    <input
      id="login-email"
      type="email"
      placeholder="you@example.com"
      autocomplete="email"
    >

    <button
      class="btn btn-block"
      id="login-next"
    >
      Continue
    </button>

    <p
      id="login-error"
      class="form-error"
    ></p>
  `;

  const emailInput = document.getElementById("login-email");

  emailInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      doEmailLogin();
    }
  });

  document
    .getElementById("login-next")
    .addEventListener("click", doEmailLogin);
}

function renderRegisterForm() {
  activateTab(false);

  document.getElementById("auth-form").innerHTML = `
    <label>Full Name</label>
    <input
      id="register-name"
      autocomplete="name"
    >

    <label>Email Address</label>
    <input
      id="register-email"
      type="email"
      autocomplete="email"
    >

    <label>Phone Number</label>
    <input
      id="register-phone"
      type="tel"
      autocomplete="tel"
    >

    <button
      class="btn btn-block"
      id="register-next"
    >
      Continue
    </button>

    <p
      id="register-error"
      class="form-error"
    ></p>
  `;

  ["register-name", "register-email", "register-phone"]
    .map((id) => document.getElementById(id))
    .forEach((input) =>
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          doRegister();
        }
      })
    );

  document
    .getElementById("register-next")
    .addEventListener("click", doRegister);
}

// -----------------------------------------------------------------------------
// Registration
// -----------------------------------------------------------------------------

async function doRegister() {
  const name = document.getElementById("register-name").value.trim();
  const email = document.getElementById("register-email").value.trim();
  const phone = document.getElementById("register-phone").value.trim();

  const btn = document.getElementById("register-next");
  const err = document.getElementById("register-error");

  err.style.display = "none";

  if (!name || !email || !phone) {
    err.textContent = "Please fill in all fields.";
    err.style.display = "block";
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    err.textContent = "Enter a valid email address.";
    err.style.display = "block";
    return;
  }

  if (phone.length < 8) {
    err.textContent = "Enter a valid phone number.";
    err.style.display = "block";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Sending...";

  try {
    await Api.register(name, email, phone);
    showVerificationForm(email, false);
  } catch (e) {
    err.textContent = e.message;
    err.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = "Continue";
  }
}

// -----------------------------------------------------------------------------
// Login
// -----------------------------------------------------------------------------

async function doEmailLogin() {
  const email = document.getElementById("login-email").value.trim();

  const btn = document.getElementById("login-next");
  const err = document.getElementById("login-error");

  err.style.display = "none";

  if (!email) {
    err.textContent = "Enter your email.";
    err.style.display = "block";
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    err.textContent = "Enter a valid email address.";
    err.style.display = "block";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Sending...";

  try {
    await Api.login(email);
    showVerificationForm(email, true);
  } catch (e) {
    err.textContent = e.message;
    err.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = "Continue";
  }
}

// -----------------------------------------------------------------------------
// Email Verification
// -----------------------------------------------------------------------------

function showVerificationForm(email, isLogin) {
  document.getElementById("auth-form").innerHTML = `
    <h3>Check your email</h3>

    <p style="line-height:1.6">
      We've sent a
      <strong>6-digit verification code</strong>
      to
      <strong>${email}</strong>.
    </p>

    <p style="color:#666;font-size:14px">
      The code expires in 10 minutes.
    </p>

    <label>Verification Code</label>

    <input
      id="verification-code"
      type="text"
      maxlength="6"
      inputmode="numeric"
      pattern="[0-9]*"
      autocomplete="one-time-code"
      placeholder="123456"
    >

    <button
      class="btn btn-block"
      id="verify-btn"
    >
      Verify
    </button>

    <p id="resendText">
      Resend code in 30s
    </p>

    <button
      id="resendBtn"
      disabled
    >
      Resend Code
    </button>

    <button
      class="btn btn-secondary btn-block"
      id="back-btn"
      style="margin-top:10px"
    >
      Back
    </button>

    <p
      id="verify-error"
      class="form-error"
    ></p>
  `;

  document
    .getElementById("verification-code")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        verifyCode(email, isLogin);
      }
    });

  document
    .getElementById("verify-btn")
    .addEventListener("click", () => verifyCode(email, isLogin));

  document
    .getElementById("resendBtn")
    .addEventListener("click", () =>
      resendVerificationCode(email, isLogin)
    );

  startResendTimer();

  document
    .getElementById("back-btn")
    .addEventListener("click", () => {
      clearInterval(resendTimer);

      if (isLogin) {
        renderLoginForm();
      } else {
        renderRegisterForm();
      }
    });
}

// -----------------------------------------------------------------------------
// Verify Code
// -----------------------------------------------------------------------------

async function verifyCode(email, isLogin) {
  const code = document
    .getElementById("verification-code")
    .value
    .replace(/\s/g, "")
    .trim();

  const btn = document.getElementById("verify-btn");
  const err = document.getElementById("verify-error");

  err.style.display = "none";

  if (code.length !== 6) {
    err.textContent = "Enter the 6-digit code.";
    err.style.display = "block";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Verifying...";

  try {
    const result = isLogin
      ? await Api.verifyLogin(email, code)
      : await Api.verifyEmail(email, code);

    Api.setToken(result.token);
    Api.setUser(result.user);

    clearInterval(resendTimer);

    renderShell();
    await goto("home");

    await setupPush();

  } catch (e) {
    err.textContent = e.message;
    err.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = "Verify";
  }
}

// -----------------------------------------------------------------------------
// Resend Timer
// -----------------------------------------------------------------------------

function startResendTimer() {
  clearInterval(resendTimer);

  let seconds = 30;

  const btn = document.getElementById("resendBtn");
  const txt = document.getElementById("resendText");

  btn.disabled = true;
  txt.textContent = `Resend code in ${seconds}s`;

  resendTimer = setInterval(() => {
    seconds--;

    if (seconds <= 0) {
      clearInterval(resendTimer);
      txt.textContent = "";
      btn.disabled = false;
      return;
    }

    txt.textContent = `Resend code in ${seconds}s`;
  }, 1000);
}

// -----------------------------------------------------------------------------
// Resend Verification Code
// -----------------------------------------------------------------------------

async function resendVerificationCode(email, isLogin) {
  const btn = document.getElementById("resendBtn");
  const err = document.getElementById("verify-error");

  err.style.display = "none";

  btn.disabled = true;
  btn.textContent = "Sending...";

  try {
    await Api.resendCode(
      email,
      isLogin ? "login" : "register"
    );

    // Replace with your toast/snackbar later if available.
    alert("A new verification code has been sent to your email.");

    startResendTimer();

  } catch (e) {
    err.textContent = e.message;
    err.style.display = "block";

    btn.disabled = false;
    btn.textContent = "Resend Code";
  }
}

// -----------------------------------------------------------------------------
// Main Application Shell
// -----------------------------------------------------------------------------

function renderShell() {
  clearInterval(resendTimer);

  app.innerHTML = `
    <div class="topbar">

      <div class="topbar-brand">
        <img
          src="/icons/icon-192.png"
          class="topbar-logo"
          alt="Tumya"
        >

        <h1>Tumya</h1>
      </div>

      <button
        id="cart-button"
        class="cart-button"
        aria-label="Shopping Cart"
      >
        🛒

        <span
          id="cart-count"
          class="cart-count"
        >
          0
        </span>

      </button>

    </div>

    <div
      id="view"
      class="container"
    ></div>

    <div class="tabbar">

      <button data-tab="home">
        Shop
      </button>

      <button data-tab="parcel">
        Send/Receive
      </button>

      <button data-tab="orders">
        Orders
      </button>

      <button data-tab="account">
        Account
      </button>

    </div>
  `;

    document
    .querySelectorAll(".tabbar button")
    .forEach((button) => {
      button.addEventListener("click", () => goto(button.dataset.tab));
    });

  document
    .getElementById("cart-button")
    .addEventListener("click", renderCartPage);

  updateCartBadge();
}

// -----------------------------------------------------------------------------
// Navigation
// -----------------------------------------------------------------------------

export async function goto(tab) {
  activeTab = tab;

  document
    .querySelectorAll(".tabbar button")
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.tab === tab
      );
    });

  const view = document.getElementById("view");

  view.innerHTML = `
    <div class="empty-state">
      Loading...
    </div>
  `;

  try {

    switch (tab) {

      case "home":
        await renderHome(view);
        break;

      case "parcel":
        renderParcelForm(view);
        break;

      case "orders":
        await renderOrders(view);
        break;

      case "account":
        await renderAccount(view);
        break;

      default:
        await renderHome(view);
        break;
    }

  } catch (err) {

    console.error(err);

    view.innerHTML = `
      <div class="empty-state">
        Couldn't load this page.
        <br><br>
        ${err.message}
      </div>
    `;
  }
}

// -----------------------------------------------------------------------------
// Global Functions (used by inline HTML)
// -----------------------------------------------------------------------------

window.openProduct = openProduct;
window.closeProduct = closeProduct;
window.openImageViewer = openImageViewer;
window.closeImageViewer = closeImageViewer;
window.changeQty = changeQty;

window.addToCart = addToCart;

window.openOrderDetail = openOrderDetail;

window.parcelWizard = parcelWizard;
window.renderParcelStep = renderParcelStep;

// -----------------------------------------------------------------------------
// Service Worker
// -----------------------------------------------------------------------------

const canUseServiceWorker =
  "serviceWorker" in navigator &&
  (
    window.isSecureContext ||
    location.hostname === "localhost" ||
    location.hostname.startsWith("127.")
  );

if (canUseServiceWorker) {

  navigator.serviceWorker
    .register("/sw.js")
    .then(() => console.log("✅ Service Worker registered"))
    .catch((err) => {
      console.error("Service Worker registration failed:", err);
    });

}

// -----------------------------------------------------------------------------
// Start Application
// -----------------------------------------------------------------------------

boot();

if (Api.token()) {

  if (canUseServiceWorker) {

    navigator.serviceWorker.ready
      .then(() => setupPush())
      .catch(console.error);

  } else {

    setupPush();

  }

}
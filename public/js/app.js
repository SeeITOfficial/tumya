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
// --- App state ---
let activeTab = "home";
let resendTimer = null;

const app = document.getElementById("app");

function trackCodeFromUrl() {
  return new URLSearchParams(location.search).get("track");
}

// --- Boot ---
async function boot() {
  if (!Api.token()) {
    renderLogin();
  } else {
    renderShell();
    const trackCode = trackCodeFromUrl();
    if (trackCode) {
      await goto("orders");
      await openOrderDetail(trackCode);
    } else {
      await goto("home");
    }
  }
}

export function renderLogin() {
  app.innerHTML = `
    <div class="login-screen">

      <div class="login-hero">
        <img src="/icons/icon-192.png" class="login-logo" />
        <h1 class="login-title">Tumya</h1>
        <p class="login-tagline">
          Connecting India 🇮🇳 and Uganda 🇺🇬
        </p>
      </div>

      <div class="card login-card">

        <h2>Welcome</h2>

        <div class="login-tabs">
          <button id="tab-login" class="active">Sign In</button>
          <button id="tab-register">Create Account</button>
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

function activateTab(login) {
  document.getElementById("tab-login").classList.toggle("active", login);
  document.getElementById("tab-register").classList.toggle("active", !login);
}

function renderLoginForm() {
  activateTab(true);

  document.getElementById("auth-form").innerHTML = `
    <label>Email Address</label>
    <input id="login-email" type="email" placeholder="you@example.com">

    <button class="btn btn-block" id="login-next">
      Continue
    </button>

    <p id="login-error" class="form-error"></p>
  `;

  document
    .getElementById("login-next")
    .addEventListener("click", doEmailLogin);
}

function renderRegisterForm() {
  activateTab(false);

  document.getElementById("auth-form").innerHTML = `
    <label>Full Name</label>
    <input id="register-name">

    <label>Email Address</label>
    <input id="register-email" type="email">

    <label>Phone Number</label>
    <input id="register-phone">

    <button class="btn btn-block" id="register-next">
      Continue
    </button>

    <p id="register-error" class="form-error"></p>
  `;

  document
    .getElementById("register-next")
    .addEventListener("click", doRegister);
}

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
function showVerificationForm(email, isLogin) {
  document.getElementById("auth-form").innerHTML = `
    <h3>Check your email</h3>

    <p style="line-height:1.6">
      We've sent a <strong>6-digit verification code</strong> to
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

    <button class="btn btn-block" id="verify-btn">
      Verify
    </button>

    <p id="resendText">Resend code in 30s</p>

    <button id="resendBtn" disabled>
        Resend Code
    </button>

    <button
      class="btn btn-secondary btn-block"
      id="back-btn"
      style="margin-top:10px"
    >
      Back
    </button>

    <p id="verify-error" class="form-error"></p>
  `;

  document
    .getElementById("verify-btn")
    .addEventListener("click", () => verifyCode(email, isLogin));

  document
    .getElementById("resendBtn")
    .addEventListener("click", () => resendVerificationCode(email, isLogin));

  startResendTimer();

  document
    .getElementById("back-btn")
    .addEventListener("click", () => {
      if (isLogin) {
        renderLoginForm();
      } else {
        renderRegisterForm();
      }
    });
}

async function verifyCode(email, isLogin) {
  const code = document
    .getElementById("verification-code")
    .value
    .replace(/\s/g, "")
    .trim();

  const err = document.getElementById("verify-error");
  err.style.display = "none";

  if (code.length !== 6) {
    err.textContent = "Enter the 6-digit code.";
    err.style.display = "block";
    return;
  }

  try {
    const result = isLogin
      ? await Api.verifyLogin(email, code)
      : await Api.verifyEmail(email, code);

    Api.setToken(result.token);
    Api.setUser(result.user);

    renderShell();
    await goto("home");
    setupPush();

  } catch (e) {
    err.textContent = e.message;
    err.style.display = "block";
  }
}


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

async function resendVerificationCode(email, isLogin) {

  const btn = document.getElementById("resendBtn");
  const err = document.getElementById("verify-error");

  err.style.display = "none";
  btn.disabled = true;

  try {

    await Api.resendCode(
      email,
      isLogin ? "login" : "register"
    );

    alert("A new verification code has been sent to your email.");

    startResendTimer();

  } catch (e) {

    err.textContent = e.message;
    err.style.display = "block";

    btn.disabled = false;
  }
}


function renderShell() {
  app.innerHTML = `
    <div class="topbar">
      <div class="topbar-brand">
        <img src="/icons/icon-192.png" class="topbar-logo" />
        <h1>Tumya</h1>
      </div>

      <button id="cart-button" class="cart-button">
        🛒
        <span id="cart-count" class="cart-count">0</span>
      </button>
    </div>
    <div id="view" class="container"></div>
    <div class="tabbar">
      <button data-tab="home">Shop</button>
      <button data-tab="parcel">Send/Receive</button>
      <button data-tab="orders">Orders</button>
      <button data-tab="account">Account</button>
    </div>
  `;
  document
  .querySelectorAll(".tabbar button")
  .forEach((b) => b.addEventListener("click", () => goto(b.dataset.tab)));

  document
    .getElementById("cart-button")
    .addEventListener("click", renderCartPage);

  updateCartBadge();
}

export async function goto(tab) {
  activeTab = tab;
  document
    .querySelectorAll(".tabbar button")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  const view = document.getElementById("view");
  view.innerHTML = `<div class="empty-state">Loading...</div>`;

  try {
    if (tab === "home") {
      await renderHome(view);
    } else if (tab === "parcel") {
      renderParcelForm(view);
    } else if (tab === "orders") {
      await renderOrders(view);
    } else if (tab === "account") {
      await renderAccount(view);
    }
  } catch (err) {
    view.innerHTML = `<div class="empty-state">Couldn't load this page.<br>${err.message}</div>`;
  }
}

// Inline HTML handlers
window.openProduct = openProduct;
window.closeProduct = closeProduct;
window.openImageViewer = openImageViewer;
window.closeImageViewer = closeImageViewer;
window.changeQty = changeQty;
window.addToCart = addToCart;
window.openOrderDetail = openOrderDetail;
window.parcelWizard = parcelWizard;
window.renderParcelStep = renderParcelStep;

const canUseServiceWorker =
  "serviceWorker" in navigator &&
  (window.isSecureContext ||
    location.hostname === "localhost" ||
    location.hostname.startsWith("127."));

if (canUseServiceWorker) {
  navigator.serviceWorker.register("/sw.js");
}

boot();
if (Api.token()) setupPush();

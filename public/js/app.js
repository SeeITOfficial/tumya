import { Api } from "./api.js";
import { setupPush } from "./notifications/notifications.js";
import { renderHome, openProduct, closeProduct, openImageViewer, closeImageViewer, changeQty } from "./catalog/catalog.js";
import { addToCart } from "./catalog/cart.js";
import { renderParcelForm, renderParcelStep, parcelWizard } from "./parcel/wizard.js";
import { renderOrders, openOrderDetail } from "./orders/orders.js";
import { renderAccount } from "./account/account.js";

// --- App state ---
let activeTab = "home";

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
        <p class="login-tagline">Send. Receive. Order.</p>
      </div>
      <div class="card login-card">
        <label>Your name</label>
        <input id="login-name" placeholder="e.g. Musa Kintu" />
        <label>Phone number</label>
        <input id="login-phone" placeholder="+256 7XX XXX XXX" inputmode="tel" />
        <button class="btn btn-block login-submit" id="login-btn">Continue</button>
        <p id="login-error" class="form-error login-error"></p>
      </div>
    </div>
  `;
  document.getElementById("login-btn").addEventListener("click", doLogin);
}

async function doLogin() {
  const name = document.getElementById("login-name").value.trim();
  const phone = document.getElementById("login-phone").value.trim();
  const errEl = document.getElementById("login-error");
  errEl.style.display = "none";

  if (!phone) {
    errEl.textContent = "Phone number is required.";
    errEl.style.display = "block";
    return;
  }

  try {
    const { token, user } = await Api.identify(phone, name || undefined);
    Api.setToken(token);
    Api.setUser(user);
    renderShell();
    const trackCode = trackCodeFromUrl();
    if (trackCode) {
      await goto("orders");
      await openOrderDetail(trackCode);
    } else {
      await goto("home");
    }
    setupPush();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = "block";
  }
}

function renderShell() {
  app.innerHTML = `
    <div class="topbar">
      <div class="topbar-brand">
        <img src="/icons/icon-192.png" class="topbar-logo" />
        <h1>Tumya</h1>
      </div>
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

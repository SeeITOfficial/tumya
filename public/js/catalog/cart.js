import { Api } from "../api.js";
import { escapeHtml } from "../shared/utils.js";
import { toast } from "../shared/ui.js";
import { goto } from "../app.js";
import {
  getCatalogCache,
  closeProduct,
  getProductQty,
} from "./catalog.js";

let cart = []; // [{item, qty}]

export function getCart() {
  return cart;
}

export function updateCartBadge() {
  const badge = document.getElementById("cart-count");

  if (!badge) return;

  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);

  badge.textContent = totalItems;

  badge.style.display = totalItems > 0 ? "flex" : "none";
}

export function addToCart(itemId) {

  const catalogCache = getCatalogCache();
  const item = catalogCache.find((i) => i.id === itemId);
  const productQty = getProductQty();

  const existing = cart.find((c) => c.item.id === itemId);

  if (existing) {

    existing.qty += productQty;

  } else {

    cart.push({
      item,
      qty: productQty,
    });

  }

  renderCartBar();
  updateCartBadge();

  toast(`Added ${productQty} × ${item.name}`);

}

export function renderCartBar() {
  const bar = document.getElementById("cart-bar");
  if (!bar) return;
  if (cart.length === 0) {
    bar.innerHTML = "";
    return;
  }

  const total = cart.reduce((s, c) => s + c.item.price * c.qty, 0);
  bar.innerHTML = `
    <div class="card cart-bar">
      <div class="cart-summary">
        <div class="cart-summary-count">${cart.reduce((s, c) => s + c.qty, 0)} item(s)</div>
        <div class="cart-summary-total">₹${total.toFixed(2)}</div>
      </div>
      <button class="btn" id="checkout-btn">Checkout</button>
    </div>
  `;
  document
    .getElementById("checkout-btn")
    .addEventListener("click", renderCheckout);
}

function renderCheckout() {
  const view = document.getElementById("view");
  const total = cart.reduce((s, c) => s + c.item.price * c.qty, 0);
  view.innerHTML = `
    <h2 class="page-title">Checkout</h2>
    <div class="card checkout-summary">
      ${cart
        .map(
          (c) => `
        <div class="checkout-row">
          <span class="checkout-item-name">${escapeHtml(c.item.name)} × ${c.qty}</span>
          <span class="checkout-item-price">₹${(c.item.price * c.qty).toFixed(2)}</span>
        </div>
      `,
        )
        .join("")}
      <div class="checkout-total-row">
        <span>Total</span><span>₹${total.toFixed(2)}</span>
      </div>
    </div>

    <label>Payment method</label>
    <div class="payment-options">
      <label class="card payment-option">
        <input type="radio" name="pm" value="cod_cash" checked /> Cash on delivery
      </label>
      <label class="card payment-option">
        <input type="radio" name="pm" value="cod_upi_scan" /> Scan &amp; pay (GPay/UPI) at handoff
      </label>
    </div>

    <button class="btn btn-block form-action-primary" id="place-order-btn">Place order</button>
    <button class="btn btn-outline btn-block form-action-secondary" id="cancel-checkout-btn">Back</button>
  `;
  document
    .getElementById("cancel-checkout-btn")
    .addEventListener("click", () => goto("home"));
  document
    .getElementById("place-order-btn")
    .addEventListener("click", placeCatalogOrder);
}

async function placeCatalogOrder() {
  const payment_mode = document.querySelector('input[name="pm"]:checked').value;
  const items = cart.map((c) => ({ catalog_item_id: c.item.id, qty: c.qty }));
  try {
    const order = await Api.placeCatalogOrder(items, payment_mode);
    cart = [];
    updateCartBadge();

    const view = document.getElementById("view");
    view.innerHTML = orderPlacedHtml(order);
    document
      .getElementById("back-home-btn")
      .addEventListener("click", () => goto("home"));
  } catch (err) {
    toast(err.message, true);
  }
}

function orderPlacedHtml(order) {
  return `
    <div class="card success-card">
      <div class="success-icon">📦</div>
      <h2 class="success-title">Order placed</h2>
      <p class="success-copy">Your tracking code:</p>
      <div class="badge success-badge">${order.tracking_code}</div>
      <p class="success-note">
        ${
          order.payment_mode === "cod_upi_scan"
            ? "We'll show you a QR code to scan when your order arrives."
            : "Pay cash when your order arrives."
        }
      </p>
      <button class="btn btn-block success-action" id="back-home-btn">Back to shop</button>
    </div>
  `;
}

export function renderCartPage() {
  const view = document.getElementById("view");

  if (cart.length === 0) {
    view.innerHTML = `
      <div class="empty-state">
        <h2>Your cart is empty</h2>
        <p>Add some products to continue shopping.</p>

        <button class="btn btn-block" id="continue-shopping-btn">
          Continue Shopping
        </button>
      </div>
    `;

    document
      .getElementById("continue-shopping-btn")
      .addEventListener("click", () => goto("home"));

    return;
  }

  const subtotal = cart.reduce(
    (sum, c) => sum + c.item.price * c.qty,
    0
  );

  view.innerHTML = `
    <h2 class="page-title">Shopping Cart</h2>

    <div class="card">

      ${cart
        .map(
          (c) => `
            <div class="checkout-row">
              <div>
                <strong>${escapeHtml(c.item.name)}</strong><br>
                Qty: ${c.qty}
              </div>

              <div>
                ₹${(c.item.price * c.qty).toFixed(2)}
              </div>
            </div>
          `
        )
        .join("")}

      <hr>

      <div class="checkout-total-row">
        <span>Subtotal</span>
        <span>₹${subtotal.toFixed(2)}</span>
      </div>

    </div>

    <button class="btn btn-outline btn-block" id="continue-shopping-btn">
      Continue Shopping
    </button>

    <button class="btn btn-block" id="checkout-btn">
      Checkout
    </button>
  `;

  document
    .getElementById("continue-shopping-btn")
    .addEventListener("click", () => goto("home"));

  document
    .getElementById("checkout-btn")
    .addEventListener("click", renderCheckout);
}
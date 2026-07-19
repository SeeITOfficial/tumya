import { Api } from "../api.js";
import { escapeHtml } from "../shared/utils.js";
import { toast } from "../shared/ui.js";
import { goto } from "../app.js";
import {
  getCatalogCache,
  closeProduct,
  getProductQty,
} from "./catalog.js";

let cart = {
  orderItems: [],
  bookingItems: [],
};

export function getCart() {
  return cart;
}

export function updateCartBadge() {
  const badge = document.getElementById("cart-count");

  if (!badge) return;

  const totalItems =
    cart.orderItems.reduce((sum, item) => sum + item.qty, 0) +
    cart.bookingItems.reduce((sum, item) => sum + item.qty, 0);

  badge.textContent = totalItems;

  badge.style.display = totalItems > 0 ? "flex" : "none";
}

export function addToCart(itemId) {
  const catalogCache = getCatalogCache();
  const item = catalogCache.find((i) => i.id === itemId);

  if (!item) {
    toast("Product not found.", true);
    return;
  }

  const productQty = getProductQty();

  // Decide which cart section to use
  const targetCart =
    item.stock_status === "coming_soon"
      ? cart.bookingItems
      : cart.orderItems;

  const existing = targetCart.find((c) => c.item.id === itemId);

  if (existing) {
    existing.qty += productQty;
  } else {
    targetCart.push({
      item,
      qty: productQty,
    });
  }

  renderCartBar();
  updateCartBadge();

  if (item.stock_status === "coming_soon") {
    toast(`Booked ${productQty} × ${item.name}`);
  } else {
    toast(`Added ${productQty} × ${item.name}`);
  }

  closeProduct();
}

export function renderCartBar() {
  const bar = document.getElementById("cart-bar");
  if (!bar) return;

  const orderCount = cart.orderItems.reduce((s, c) => s + c.qty, 0);
  const bookingCount = cart.bookingItems.reduce((s, c) => s + c.qty, 0);

  const payableTotal = cart.orderItems.reduce(
    (s, c) => s + c.item.price * c.qty,
    0
  );

  if (orderCount === 0 && bookingCount === 0) {
    bar.innerHTML = "";
    return;
  }

  bar.innerHTML = `
    <div class="card cart-bar">

      <div class="cart-summary">

        <div class="cart-summary-count">

          ${orderCount} order item(s)

          ${
            bookingCount > 0
              ? `<br><small>${bookingCount} booking(s)</small>`
              : ""
          }

        </div>

        <div class="cart-summary-total">
          ₹${payableTotal.toFixed(2)}
        </div>

      </div>

      <button class="btn" id="checkout-btn">
        Checkout
      </button>

    </div>
  `;

  document
    .getElementById("checkout-btn")
    .addEventListener("click", renderCartPage);
}

function renderCheckout() {
  const view = document.getElementById("view");
    const total = cart.orderItems.reduce(
      (s, c) => s + c.item.price * c.qty,
      0
    );
    view.innerHTML = `
    <h2 class="page-title">Checkout</h2>
    <div class="card checkout-summary">
      ${cart.orderItems
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
  const payment_mode =
    document.querySelector('input[name="pm"]:checked').value;

  const items = cart.orderItems.map((c) => ({
    catalog_item_id: c.item.id,
    qty: c.qty,
  }));

  try {
    const order = await Api.placeCatalogOrder(items, payment_mode);

    // Save booking items before clearing the cart
    const bookingItems = [...cart.bookingItems];

    cart.orderItems = [];
    cart.bookingItems = [];

    updateCartBadge();

    const view = document.getElementById("view");

    if (bookingItems.length > 0) {
      view.innerHTML = bookingPromptHtml(order, bookingItems);

      document
        .getElementById("book-items-btn")
        .addEventListener("click", () =>
          createBookings(order, bookingItems)
        );

      document
        .getElementById("skip-booking-btn")
        .addEventListener("click", () => {
          view.innerHTML = orderPlacedHtml(order);

          document
            .getElementById("back-home-btn")
            .addEventListener("click", () => goto("home"));
        });

    } else {

      view.innerHTML = orderPlacedHtml(order);

      document
        .getElementById("back-home-btn")
        .addEventListener("click", () => goto("home"));
    }

  } catch (err) {
    toast(err.message, true);
  }
}

function bookingPromptHtml(order, bookingItems) {
  return `
    <div class="card success-card">

      <div class="success-icon">✅</div>

      <h2 class="success-title">
        Order placed!
      </h2>

      <p>
        Tracking code:
      </p>

      <div class="badge success-badge">
        ${order.tracking_code}
      </div>

      <hr>

      <h3>
        Book remaining items?
      </h3>

      <p>

        You still have
        <strong>${bookingItems.length}</strong>
        bookable item(s).

      </p>

      <p>

        No payment is required.

        We'll source them and notify you
        once they arrive.

      </p>

      <button
        class="btn btn-block"
        id="book-items-btn">

        Book Items

      </button>

      <button
        class="btn btn-outline btn-block"
        id="skip-booking-btn">

        Maybe Later

      </button>

    </div>
  `;
}

async function createBookings(order, bookingItems) {

  try {

    const booking = await Api.createCatalogBookings(
      bookingItems.map((item) => ({
        catalog_item_id: item.item.id,
        qty: item.qty,
      }))
    );

    const view = document.getElementById("view");

    view.innerHTML = `
    <div class="card success-card">

    <div class="success-icon">📦</div>

    <h2 class="success-title">
    Booking Confirmed
    </h2>

    <p>

    Booking IDs

    </p>

    <div class="badge success-badge">

    ${booking.booking_ids.join(", ")}

    </div>

    <hr>

    <p>

    Your booking has been added to our sourcing queue.

    Our sourcing team will purchase these items and notify you when they arrive in India.

    </p>

    <button
    class="btn btn-block"
    id="back-home-btn">

    Continue Shopping

    </button>

    </div>
    `;

    cart.bookingItems = [];
    updateCartBadge();  
    
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

  const orderItems = cart.orderItems;
  const bookingItems = cart.bookingItems;

  if (orderItems.length === 0 && bookingItems.length === 0) {
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

  const subtotal = orderItems.reduce(
    (sum, c) => sum + c.item.price * c.qty,
    0
  );

  view.innerHTML = `
    <h2 class="page-title">Shopping Cart</h2>

    ${
      orderItems.length
        ? `
      <h3>Ready to Order</h3>

      <div class="card">

        ${orderItems
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
      `
        : ""
    }

    ${
      bookingItems.length
        ? `
      <h3 style="margin-top:24px;">Book for Next Shipment</h3>

      <div class="card">

        ${bookingItems
          .map(
            (c) => `
              <div class="checkout-row">

                <div>

                  <strong>${escapeHtml(c.item.name)}</strong><br>

                  Qty: ${c.qty}

                </div>

                <div>

                  Booking

                </div>

              </div>
            `
          )
          .join("")}

        <div class="form-help" style="margin-top:16px;">

          These items aren't paid for now.
          We'll source them and notify you when they're available.

        </div>

      </div>
      `
        : ""
    }

    <button class="btn btn-outline btn-block" id="continue-shopping-btn">
      Continue Shopping
    </button>

    ${
      orderItems.length
        ? `
          <button class="btn btn-block" id="checkout-btn">
            Checkout
          </button>
          `
        : bookingItems.length
          ? `
          <button class="btn btn-block" id="booking-btn">
            Create Booking
          </button>
          `
          : ""
    }
  `;

  document
    .getElementById("continue-shopping-btn")
    .addEventListener("click", () => goto("home"));

  if (orderItems.length) {
    document
      .getElementById("checkout-btn")
      .addEventListener("click", renderCheckout);
  }

  if (!orderItems.length && bookingItems.length) {
    document
      .getElementById("booking-btn")
      .addEventListener("click", () =>
        createBookings(
          null,
          bookingItems
        )
      );
  }
}
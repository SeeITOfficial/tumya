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

try {
  const saved = localStorage.getItem("tumya_cart");
  if (saved) cart = JSON.parse(saved);
} catch (e) {
  console.error("Failed to load cart", e);
}

function saveCart() {
  localStorage.setItem("tumya_cart", JSON.stringify(cart));
}

let checkoutLocation = { delivery_lat: null, delivery_lng: null, delivery_address_text: "" };

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

  if (item.stock_status === "out_of_stock") {
    toast("This item is currently out of stock.", true);
    return;
  }

  const productQty = getProductQty();

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

  saveCart();
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

  checkoutLocation = { delivery_lat: null, delivery_lng: null, delivery_address_text: "" };

  view.innerHTML = `
    <h2 class="page-title">Checkout</h2>
    <div class="card cart-summary-card checkout-summary">
      ${cart.orderItems
        .map(
          (c) => `
        <div class="checkout-row">
          <div class="checkout-item-details">
            <div class="checkout-item-name">${escapeHtml(c.item.name)}</div>
            <div class="checkout-item-qty">Qty: ${c.qty}</div>
          </div>
          <div class="checkout-item-price">₹${(c.item.price * c.qty).toFixed(2)}</div>
        </div>
      `,
        )
        .join("")}
      <div class="checkout-total-row">
        <span>Total</span><span>₹${total.toFixed(2)}</span>
      </div>
    </div>

    <h3 style="margin-top:24px; font-size: 16px;">Delivery Location</h3>
    <div class="card location-picker" style="padding: 16px; border: 1.5px solid rgba(242,104,10,0.15);">
      <button type="button" class="btn btn-outline btn-block" id="use-current-location-btn">
        📍 Use current location
      </button>
      <div id="location-status" class="form-help" style="margin-top:8px;"></div>
      <div style="margin: 16px 0 8px; font-weight: 600; font-size: 13px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.5px;">Or type an address / landmark</div>
      <textarea id="delivery-address-text" placeholder="e.g. Plot 14, Ntinda Road, near Shell station" rows="3" style="resize: none; padding: 12px; border-radius: 12px; border: 1.5px solid rgba(241, 223, 207, 0.8); background: #fdfaf7; width: 100%; box-sizing: border-box; font-family: inherit; font-size: 15px; transition: border-color 0.2s ease;"></textarea>
    </div>

    <h3 style="margin-top:24px; font-size: 16px;">Payment Method</h3>
    <div class="payment-options">
      <label class="card payment-option">
        <input type="radio" name="pm" value="cod_cash" checked /> Cash on delivery
      </label>
      <label class="card payment-option">
        <input type="radio" name="pm" value="cod_upi_scan" /> Scan &amp; pay (GPay/UPI) at handoff
      </label>
    </div>

    <div class="cart-actions">
      <button class="btn btn-block checkout-pulse" id="place-order-btn">Place Order &rarr;</button>
      <button class="btn btn-outline btn-block" id="cancel-checkout-btn">Back to Cart</button>
    </div>
  `;

  document
    .getElementById("cancel-checkout-btn")
    .addEventListener("click", () => goto("home"));
  document
    .getElementById("place-order-btn")
    .addEventListener("click", placeCatalogOrder);

  document
    .getElementById("delivery-address-text")
    .addEventListener("input", (e) => {
      checkoutLocation.delivery_address_text = e.target.value;
    });

  document
    .getElementById("use-current-location-btn")
    .addEventListener("click", grabCurrentLocation);
}

function grabCurrentLocation() {
  const statusEl = document.getElementById("location-status");
  if (!navigator.geolocation) {
    statusEl.textContent = "Geolocation not supported on this device.";
    return;
  }
  if (!window.isSecureContext) {
    statusEl.textContent = "Location needs a secure (https) connection. Type your address instead.";
    return;
  }
  statusEl.textContent = "Getting your location...";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const isImprecise = accuracy > 5000;
      
      checkoutLocation.delivery_lat = latitude;
      checkoutLocation.delivery_lng = longitude;
      
      if (isImprecise) {
        statusEl.innerHTML = `⚠️ Location is imprecise (±${Math.round(accuracy / 1000)}km). Fetching approximate area...`;
      } else {
        statusEl.textContent = `✅ Location captured (±${Math.round(accuracy)}m accuracy). Fetching address...`;
      }
      
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.display_name) {
            const input = document.getElementById("delivery-address-text");
            if (input) {
              input.value = data.display_name;
              checkoutLocation.delivery_address_text = data.display_name;
            }
            if (isImprecise) {
              statusEl.innerHTML = `⚠️ Captured: ${data.address.city || data.address.town || data.address.state || "Approximate area"}. <strong>Please verify/edit the address below!</strong>`;
            } else {
              statusEl.textContent = `✅ Location captured (${data.address.city || data.address.town || data.address.suburb || "Found"})`;
            }
          } else {
             statusEl.textContent = isImprecise ? `⚠️ Location is imprecise (±${Math.round(accuracy / 1000)}km). Please type your address.` : `✅ Location captured (±${Math.round(accuracy)}m accuracy)`;
          }
        })
        .catch(e => {
          statusEl.textContent = isImprecise ? `⚠️ Location is imprecise (±${Math.round(accuracy / 1000)}km). Please type your address.` : `✅ Location captured (±${Math.round(accuracy)}m accuracy)`;
        });
    },
    (err) => {
      let msg = "Couldn't get location. Type an address instead.";
      if (err.code === err.PERMISSION_DENIED) msg = "Location access denied. Please allow it in browser settings, or type your address.";
      else if (err.code === err.POSITION_UNAVAILABLE) msg = "Location unavailable. Type your address instead.";
      else if (err.code === err.TIMEOUT) msg = "Location timed out. Type your address instead.";
      statusEl.textContent = msg;
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
}

async function placeCatalogOrder() {
  const payment_mode =
    document.querySelector('input[name="pm"]:checked').value;

  const hasCoords = checkoutLocation.delivery_lat != null && checkoutLocation.delivery_lng != null;
  const hasText = checkoutLocation.delivery_address_text.trim().length > 0;
  if (!hasCoords && !hasText) {
    toast("Add a delivery location — use current location or type an address.", true);
    return;
  }

  const items = cart.orderItems.map((c) => ({
    catalog_item_id: c.item.id,
    qty: c.qty,
  }));

  try {
    const order = await Api.placeCatalogOrder(items, payment_mode, checkoutLocation);

    const bookingItems = [...cart.bookingItems];

    cart.orderItems = [];
    cart.bookingItems = [];
    saveCart();

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
        Order ID:
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
    Tracking Code
    </p>

    <div class="badge success-badge">
    ${booking.tracking_code}

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
    saveCart();
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
      <p class="success-copy">Your Order ID:</p>
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

      <div class="card cart-summary-card">

        ${orderItems
          .map(
            (c) => `
              <div class="checkout-row">
                <div class="checkout-item-details">
                  <div class="checkout-item-name">${escapeHtml(c.item.name)}</div>
                  <div class="checkout-item-qty">Qty: ${c.qty}</div>
                </div>
                <div class="checkout-item-price">
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

      <div class="card cart-summary-card">

        ${bookingItems
          .map(
            (c) => `
              <div class="checkout-row">
                <div class="checkout-item-details">
                  <div class="checkout-item-name">${escapeHtml(c.item.name)}</div>
                  <div class="checkout-item-qty">Qty: ${c.qty}</div>
                </div>
                <div class="checkout-item-price">
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

    <div class="cart-actions">
      ${
        orderItems.length
          ? `
            <button class="btn btn-block checkout-pulse" id="checkout-btn">
              Checkout &rarr;
            </button>
            `
          : bookingItems.length
            ? `
            <button class="btn btn-block checkout-pulse" id="booking-btn">
              Create Booking &rarr;
            </button>
            `
          : ""
      }
      <button class="btn btn-outline btn-block" id="continue-shopping-btn">
        Continue Shopping
      </button>
    </div>
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
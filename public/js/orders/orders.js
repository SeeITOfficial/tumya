import { Api } from "../api.js";
import { escapeHtml } from "../shared/utils.js";
import { toast } from "../shared/ui.js";

const PARCEL_STEPS = [
  "pending_quote",
  "quoted",
  "payment_pending",
  "confirmed",
  "in_transit",
  "out_for_delivery",
  "delivered",
];

const CATALOG_STEPS = [
  "confirmed",
  "out_for_delivery",
  "delivered",
];

// Statuses where cancellation is no longer allowed
const NON_CANCELLABLE = new Set(["out_for_delivery", "in_transit", "delivered"]);

function canCancel(order) {
  return !NON_CANCELLABLE.has(order.status);
}

function formatStatus(status) {
  return String(status || "").replace(/_/g, " ");
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusDescription(order) {
  if (order.latest_note) return order.latest_note;
  const map = {
    pending_quote: "Parcel submitted, awaiting admin quote",
    quoted: "Quote ready — payment needed",
    payment_pending: "Waiting for payment confirmation",
    confirmed: "Order confirmed",
    in_transit: "On the way",
    out_for_delivery: "Out for delivery",
    delivered: "Delivered",
    ready_for_pickup: "Ready for pickup",
  };
  return map[order.status] || formatStatus(order.status);
}

function orderTypeLabel(order) {
  return order.type === "parcel" ? "📦 Parcel" : (order.status === "booking" ? "🛒 Booking" : "🛒 Order");
}

function stepsForOrder(order) {
  const steps = order.type === "parcel" ? [...PARCEL_STEPS] : [...CATALOG_STEPS];
  if (order.status === "ready_for_pickup" && !steps.includes("ready_for_pickup")) {
    steps.push("ready_for_pickup");
  }
  return steps;
}

// --- Orders list ---
export async function renderOrders(view) {
  view.innerHTML = `
    <h2 class="page-title">Orders</h2>
    <div id="orders-list" class="empty-state">Loading...</div>
  `;

  const container = document.getElementById("orders-list");

  try {
    const orders = await Api.myOrders();

    if (!orders.length) {
      container.innerHTML = `
        <div class="empty-state">
          You haven't placed any orders yet.
        </div>
      `;
      return;
    }

    const COMPLETED_STATUSES = new Set(["delivered", "cancelled"]);
    const active = orders.filter((o) => !COMPLETED_STATUSES.has(o.status));
    const completed = orders.filter((o) => COMPLETED_STATUSES.has(o.status));

    const renderCard = (order, isCompleted = false) => {
      const cancellable = canCancel(order);
      return `
    <div class="card order-card ${isCompleted ? 'order-card-completed' : ''}" data-track="${escapeHtml(order.tracking_code)}" data-id="${order.id}">
      <div class="order-card-top">
        <strong>${orderTypeLabel(order)}</strong>
        <span class="badge ${isCompleted ? 'badge-completed' : ''}">${escapeHtml(formatStatus(order.status))}</span>
      </div>
      <div class="order-card-code">${escapeHtml(order.tracking_code)}</div>
      ${order.total_amount != null ? `<div class="order-card-amount">₹${Number(order.total_amount).toFixed(2)}</div>` : ''}
      <div class="order-card-note">${escapeHtml(statusDescription(order))}</div>
      <div class="order-card-time">${escapeHtml(formatDateTime(order.created_at))}</div>
      <div class="order-card-actions">
        <button class="btn btn-sm order-card-action" type="button" data-action="view">
          View Details
        </button>
        ${cancellable
          ? `<button class="btn btn-sm btn-cancel-order" type="button" data-action="cancel" data-code="${escapeHtml(order.tracking_code)}">
              Cancel Order
            </button>`
          : `<button class="btn btn-sm btn-cancel-disabled" type="button" disabled title="Delivery has started — cannot cancel">
              Cannot Cancel
            </button>`
        }
      </div>
    </div>
  `;
    };

    container.className = "orders-list";
    container.innerHTML =
      active.map((o) => renderCard(o, false)).join("") +
      (completed.length
        ? `<div class="completed-section-title">Completed Orders</div>` +
          completed.map((o) => renderCard(o, true)).join("")
        : "");

    // View details click
    container.querySelectorAll("[data-action='view']").forEach((btn) => {
      const card = btn.closest("[data-track]");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        history.replaceState(null, "", `/?track=${card.dataset.track}`);
        openOrderDetail(card.dataset.track);
      });
    });

    // Cancel click
    container.querySelectorAll("[data-action='cancel']").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        cancelOrder(btn.dataset.code, btn.closest(".order-card"));
      });
    });
  } catch (err) {
    container.className = "empty-state";
    container.innerHTML = err.message;
  }
}

async function cancelOrder(code, cardEl) {
  const confirmed = window.confirm(`Cancel order ${code}? This cannot be undone.`);
  if (!confirmed) return;

  try {
    await Api.cancelOrder(code);
    // Animate card out
    cardEl.style.transition = "opacity 0.3s ease, transform 0.3s ease, max-height 0.4s ease, margin 0.4s ease, padding 0.4s ease";
    cardEl.style.opacity = "0";
    cardEl.style.transform = "scale(0.96)";
    cardEl.style.maxHeight = cardEl.offsetHeight + "px";
    setTimeout(() => {
      cardEl.style.maxHeight = "0";
      cardEl.style.margin = "0";
      cardEl.style.padding = "0";
    }, 300);
    setTimeout(() => cardEl.remove(), 700);
    toast(`Order ${code} cancelled`);
  } catch (err) {
    toast(err.message || "Failed to cancel order");
  }
}

export async function openOrderDetail(code = null) {
  if (!code) {
    const input = document.getElementById("track-code");
    if (!input) return;
    code = input.value.trim().toUpperCase();
  }

  if (!code) return;

  const view = document.getElementById("view");
  if (!view) return;

  view.innerHTML = `<div class="empty-state">Loading...</div>`;

  try {
    const { order, history: statusHistory, items, parcel, payment } = await Api.track(code);
    const steps = stepsForOrder(order);
    const reached = new Set((statusHistory || []).map((h) => h.status));
    reached.add(order.status);

    view.innerHTML = `
      <button class="btn btn-secondary" id="back-orders" style="margin-bottom:16px;">
        ← Back to Orders
      </button>

      <div class="card track-card order-detail-hero">
        <div class="track-card-head">
          <span class="badge">${escapeHtml(order.tracking_code)}</span>
          <span class="track-status">${escapeHtml(formatStatus(order.status))}</span>
        </div>
        <div class="order-detail-type">${orderTypeLabel(order)}</div>
        ${
          order.total_amount != null
            ? `<div class="order-detail-total">Total: ₹${Number(order.total_amount).toFixed(2)}</div>`
            : ""
        }
      </div>

      <div class="card order-detail-section">
        <h3 class="section-title" style="margin-top:0;">Progress</h3>
        <ul class="status-steps">
          ${steps
            .map((step) => {
              const done = reached.has(step);
              const current = order.status === step;
              return `
                <li class="${done ? "done" : ""} ${current ? "current" : ""}">
                  ${escapeHtml(formatStatus(step))}${done ? " ✓" : ""}
                </li>
              `;
            })
            .join("")}
        </ul>
      </div>

      ${paymentBlock(payment, order)}
      ${order.type === "parcel" ? parcelBlock(parcel) : catalogBlock(items)}

      <div class="card order-detail-section">
        <h3 class="section-title" style="margin-top:0;">Timeline</h3>
        <ul class="timeline">
          ${(statusHistory || [])
            .map(
              (h) => `
            <li class="done">
              <div class="t-status">${escapeHtml(formatStatus(h.status))}</div>
              ${
                h.note
                  ? `<div class="timeline-note">${escapeHtml(h.note)}</div>`
                  : ""
              }
              <div class="t-time">${escapeHtml(formatDateTime(h.timestamp))}</div>
            </li>
          `,
            )
            .join("")}
        </ul>
      </div>
    `;

    document.getElementById("back-orders").onclick = () => {
      historyReplaceClearTrack();
      renderOrders(view);
    };
  } catch (err) {
    view.innerHTML = `
      <button class="btn btn-secondary" id="back-orders" style="margin-bottom:16px;">
        ← Back to Orders
      </button>
      <div class="empty-state">${escapeHtml(err.message)}</div>
    `;
    document.getElementById("back-orders").onclick = () => renderOrders(view);
  }
}

function paymentBlock(payment, order) {
  if (!payment && !order.payment_mode) return "";

  const method = payment?.method || order.payment_mode || "—";
  const status = payment?.status || "pending";

  return `
    <div class="card order-detail-section">
      <h3 class="section-title" style="margin-top:0;">Payment</h3>
      <div class="detail-row">
        <span>Method</span>
        <strong>${escapeHtml(String(method).replace(/_/g, " "))}</strong>
      </div>
      <div class="detail-row">
        <span>Status</span>
        <span class="badge ${status === "verified" ? "badge-ok" : "badge-warn"}">
          ${escapeHtml(status)}
        </span>
      </div>
      ${
        payment?.reference_number
          ? `<div class="detail-row">
              <span>Reference</span>
              <strong>${escapeHtml(payment.reference_number)}</strong>
            </div>`
          : ""
      }
    </div>
  `;
}

function parcelBlock(parcel) {
  if (!parcel) return "";

  return `
    <div class="card order-detail-section">
      <h3 class="section-title" style="margin-top:0;">Parcel</h3>
      <div class="detail-row">
        <span>Description</span>
        <strong>${escapeHtml(parcel.description)}</strong>
      </div>
      <div class="detail-row">
        <span>Direction</span>
        <strong>${escapeHtml(formatStatus(parcel.direction))}</strong>
      </div>
      <div class="detail-row">
        <span>Type</span>
        <strong>${escapeHtml(parcel.send_or_receive)}</strong>
      </div>
      ${
        parcel.weight_kg != null
          ? `<div class="detail-row">
              <span>Weight</span>
              <strong>${escapeHtml(String(parcel.weight_kg))} kg</strong>
            </div>`
          : ""
      }
      ${
        parcel.quote_amount != null
          ? `<div class="detail-row">
              <span>Quote</span>
              <strong>₹${Number(parcel.quote_amount).toFixed(2)}</strong>
            </div>`
          : ""
      }
    </div>
  `;
}

function catalogBlock(items) {
  if (!items?.length) return "";

  return `
    <div class="card order-detail-section">
      <h3 class="section-title" style="margin-top:0;">Items</h3>
      ${items
        .map(
          (i) => `
        <div class="detail-row">
          <span>${escapeHtml(i.item_name || `Item #${i.catalog_item_id}`)} × ${i.qty}</span>
          <strong>₹${Number(i.unit_price).toFixed(2)}</strong>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function historyReplaceClearTrack() {
  const url = new URL(location.href);
  if (url.searchParams.has("track")) {
    url.searchParams.delete("track");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
}

/** @deprecated Use openOrderDetail — kept as alias for any remaining callers */
export const doTrack = openOrderDetail;

import { goto, AdminApi } from "../admin.js";
import { buildDashboardSection } from "../dashboard/dashboard.js";
import { toast, escapeHtml } from "../shared/utils.js";

export const STATUS_FILTERS = [
  "",
  "booking",
  "pending_quote",
  "quoted",
  "payment_pending",
  "confirmed",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "ready_for_pickup",
];

let statusFilter = "";

export function getStatusFilter() {
  return statusFilter;
}

export function setStatusFilter(value) {
  statusFilter = value;
}

// --- Orders ---
export async function renderOrders(view) {
  const orders = await AdminApi.getOrders(statusFilter || undefined);

  view.innerHTML = `
    ${buildDashboardSection(orders)}

    <div class="filter-row">
      ${STATUS_FILTERS.map(
        (s) => `
          <button
            data-f="${s}"
            class="${statusFilter === s ? "active" : ""}">
            ${s ? s.replace(/_/g, " ") : "All"}
          </button>
        `,
      ).join("")}
    </div>

    ${
      orders.length === 0
        ? `<div class="empty-state">No orders here.</div>`
        : `
          <table class="data-table">
            <thead>
              <tr>
                <th>Tracking</th>
                <th>Customer</th>
                <th>Type</th>
                <th>Status</th>
                <th>Action</th>
                <th>Amount</th>
                <th>Handled by</th>
              </tr>
            </thead>

            <tbody>

              ${orders
                .map(
                  (o) => `
                  <tr class="clickable" data-id="${o.id}">
                    <td>
                      <span class="badge">
                        ${escapeHtml(o.tracking_code || "—")}
                      </span>
                    </td>

                    <td>
                      ${escapeHtml(o.customer_name)}
                      <br>
                      <span style="color:var(--ink-soft);font-size:12px;">
                        ${escapeHtml(o.customer_phone)}
                      </span>
                    </td>

                    <td style="text-transform:capitalize;">
                      ${o.type}
                    </td>

                    <td style="text-transform:capitalize;">
                      ${o.status.replace(/_/g, " ")}
                    </td>

                    <td>${nextActionButton(o)}</td>

                    <td>
                      ${o.total_amount != null ? `₹${o.total_amount}` : "—"}
                    </td>

                    <td>
                      ${escapeHtml(o.handled_by_name || "—")}
                    </td>

                  </tr>
                `,
                )
                .join("")}

            </tbody>
          </table>
        `
    }
  `;

  document.querySelectorAll(".filter-row button").forEach((b) =>
    b.addEventListener("click", () => {
      statusFilter = b.dataset.f;
      goto("orders");
    }),
  );

  document.querySelectorAll(".stat-card[data-filter]").forEach((card) =>
    card.addEventListener("click", () => {
      statusFilter = card.dataset.filter;
      goto("orders");
    }),
  );

  document.querySelectorAll("tr.clickable").forEach((tr) =>
    tr.addEventListener("click", (e) => {

      if (e.target.closest("button")) return;

      renderOrderDetail(Number(tr.dataset.id));

    }),
  );
}


export async function renderOrderDetail(id) {
  const view = document.getElementById("view");
  view.innerHTML = `<div class="empty-state">Loading...</div>`;
  const detail = await AdminApi.getOrder(id);
  const { order, items, parcel, payment, history } = detail;
  const admins = await AdminApi.listAdmins();

  view.innerHTML = `
    <button class="btn btn-outline btn-sm"
            id="back-btn"
            style="margin-bottom:18px;">
        ← Back
    </button>

    <div class="order-hero">

        <div class="hero-top">

            <span class="badge">
                ${escapeHtml(order.tracking_code)}
            </span>

            <span class="status-chip">
                ${order.status.replace(/_/g," ")}
            </span>

        </div>

        <h2 class="hero-title">
            ${order.type === "parcel"
                ? "📦 Parcel"
                : (order.status === "booking" ? "🛒 Booking" : "🛒 Order")}
        </h2>

        <div class="hero-customer">

            <strong>${escapeHtml(order.customer_name)}</strong>

            <div class="hero-phone">

                ${escapeHtml(order.customer_phone)}

            </div>

        </div>

        <div class="hero-section">
            <label>Handled By</label>
            <div style="font-weight:600; color:var(--ink); font-size:15px; margin-top:4px;">
                ${order.handled_by_name ? escapeHtml(order.handled_by_name) : "<span style='color:var(--ink-soft); font-weight:400'>— Auto-assigned on confirmation —</span>"}
            </div>
        </div>

    </div>
    ${order.type === "catalog" ? catalogOrderDetailHtml(order, items, payment) : parcelOrderDetailHtml(order, parcel, payment)}

    <div class="card" style="padding:16px; margin-top:16px;">
      <h3 style="font-size:14px; margin:0 0 10px;">History</h3>
      <ul class="timeline">
        ${history.map((h) => `<li class="done"><div class="t-status">${h.status.replace(/_/g, " ")}</div>${h.note ? `<div style="font-size:13px;color:var(--ink-soft);">${escapeHtml(h.note)}</div>` : ""}<div class="t-time">${new Date(h.timestamp + (h.timestamp.includes('Z') ? '' : 'Z')).toLocaleString()}</div></li>`).join("")}
      </ul>
    </div>
  `;

    document
      .getElementById("back-btn")
      .addEventListener("click", () => goto("orders"));

  wireOrderDetailActions(order, parcel, payment);
}

function locationBlock(order) {
  if (order.delivery_lat == null && !order.delivery_address_text) return "";

  const hasCoords = order.delivery_lat != null && order.delivery_lng != null;
  const mapsUrl = hasCoords
    ? `https://www.google.com/maps?q=${order.delivery_lat},${order.delivery_lng}`
    : null;

  return `
    <div class="order-section">
      <h3>📍 Delivery Location</h3>
      ${order.delivery_address_text ? `
        <div class="detail-row">
          <span>Address</span>
          <strong>${escapeHtml(order.delivery_address_text)}</strong>
        </div>
      ` : ""}
      ${hasCoords ? `
        <div class="detail-row">
          <span>GPS Pin</span>
          <a href="${mapsUrl}" target="_blank" rel="noopener" class="btn btn-sm">Open in Google Maps</a>
        </div>
      ` : `
        <div class="detail-row">
          <span>GPS Pin</span>
          <span style="color:var(--ink-soft);">Not captured — address text only</span>
        </div>
      `}
    </div>
  `;
}

function catalogOrderDetailHtml(order, items, payment) {
  return `
    <div class="card" style="padding:16px; margin-bottom:16px;">
      <h3 style="font-size:14px; margin:0 0 10px;">Items</h3>
      ${(items || [])
      .map(i => `
      <div class="order-item">

          <div class="order-item-info">

              <div class="order-item-name">
                  ${escapeHtml(i.name)}
              </div>

              <div class="order-item-meta">
                  ${i.unit}
                  ·
                  Qty ${i.qty}
              </div>

          </div>

          <div class="order-item-price">
              ₹${i.unit_price * i.qty}
          </div>

      </div>
      `)
      .join("")}
      <div style="font-weight:700; margin-top:8px; border-top:1px solid var(--line); padding-top:8px;">Total: ₹${order.total_amount}</div>

      <div style="margin-top:16px;">
        <div>Payment: <span class="badge ${payment?.status === "verified" ? "badge-ok" : "badge-warn"}">${payment?.method} — ${payment?.status}</span></div>
        ${order.payment_mode === "cod_upi_scan" && payment?.status !== "verified" ? `<button class="btn btn-sm" id="reveal-qr-btn" style="margin-top:10px;">Reveal QR at handoff</button><div id="qr-area" style="margin-top:12px;"></div>` : ""}
        ${payment?.status !== "verified" ? `<button class="btn btn-sm btn-outline" id="confirm-payment-btn" style="margin-top:10px; margin-left:8px;">Mark paid</button>` : ""}
      </div>

      <div style="margin-top:16px;">
        ${catalogNextAction(order, payment)}
      </div>
    </div>
    ${locationBlock(order)}
  `;
}

function catalogNextAction(order, payment) {

    switch (order.status) {

        case "pending":
            return `
                <button
                    class="btn btn-block"
                    id="status-update-btn"
                    data-next="confirmed">

                    Confirm Order

                </button>
            `;

        case "confirmed":
            return `<button class="btn btn-sm" onclick="advanceOrder(${order.id}, 'out_for_delivery')">Start Delivery</button>`;

        case "out_for_delivery": {
            const isPaid = payment?.status === "verified";
            return `
                <button
                    class="btn btn-block"
                    id="status-update-btn"
                    data-next="delivered"
                    ${!isPaid ? 'disabled title="Mark the order as paid first"' : ''}>

                    ${!isPaid ? '🔒 Complete Delivery (Pay first)' : 'Complete Delivery'}

                </button>
            `;
        }

        case "delivered":
            return `
                <div class="badge badge-ok">

                    ✓ Delivered

                </div>
            `;

        default:
            return "";
    }

}

const QUOTE_LOCKED_STATUSES = [
  "in_transit",
  "out_for_delivery",
  "delivered",
  "ready_for_pickup",
  "cancelled",
];

function isQuoteLocked(order) {
  return QUOTE_LOCKED_STATUSES.includes(order.status);
}

function parcelOrderDetailHtml(order, parcel, payment) {

  return `

    <div class="order-section">

      <h3>📦 Parcel Details</h3>

      <div class="detail-row">
        <span>Description</span>
        <strong>${escapeHtml(parcel.description)}</strong>
      </div>

      <div class="detail-row">
        <span>Direction</span>
        <strong>${parcel.direction.replace(/_/g," ")}</strong>
      </div>

      <div class="detail-row">
        <span>Type</span>
        <strong>${parcel.send_or_receive}</strong>
      </div>

    </div>

    <div class="order-section">

      <h3>🚚 Logistics</h3>

      <div class="detail-row">
        <span>Pickup</span>
        <strong>${handlerSummary(parcel,"pickup")}</strong>
      </div>

      <div class="detail-row">
        <span>Drop</span>
        <strong>${handlerSummary(parcel,"drop")}</strong>
      </div>

    </div>

    <div class="order-section">

      <h3>⚖ Weight & Quote</h3>

      ${
        isQuoteLocked(order)
        ? `
        <div class="detail-row">
            <span>Weight</span>
            <strong>${parcel.weight_kg ?? "—"} kg</strong>
        </div>

        <div class="detail-row">
            <span>Quoted</span>
            <strong>₹${parcel.quote_amount ?? "—"}</strong>
        </div>

        ${
          parcel.suggested_amount != null
          ? `
          <div class="detail-row">
              <span>Suggested (at quote time)</span>
              <strong>₹${parcel.suggested_amount}</strong>
          </div>
          `
          : ""
        }

        <p style="font-size:13px;color:var(--ink-soft);margin:8px 0 0;">
          Quote locked — shipment has started.
        </p>
        `
        : `
        <label for="weight-input">Weight (kg)</label>
        <input
            id="weight-input"
            type="number"
            step="0.1"
            min="0.1"
            placeholder="Weight in kg"
            value="${parcel.weight_kg ?? ""}">

        <label for="custom-quote-input" style="margin-top:12px;display:block;">
          Custom Quote Amount (optional)
        </label>
        <input
            id="custom-quote-input"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Leave empty to use auto-calculated amount"
            value="${customQuoteInputValue(parcel)}">

        ${
          parcel.suggested_amount != null
          ? `
          <div class="detail-row" style="margin-top:12px;">
              <span>Auto-calculated</span>
              <strong id="suggested-amount">₹${parcel.suggested_amount}</strong>
          </div>
          `
          : `<div class="detail-row" style="margin-top:12px;">
              <span>Auto-calculated</span>
              <strong id="suggested-amount">—</strong>
          </div>`
        }

        ${
          parcel.quote_amount != null
          ? `
          <div class="detail-row">
              <span>Current quote</span>
              <strong>₹${parcel.quote_amount}</strong>
          </div>
          `
          : ""
        }

        <button
            class="btn btn-block"
            id="save-quote-btn"
            style="margin-top:12px;">

            ${parcel.quote_amount ? "Update Quote" : "Save / Send Quote"}

        </button>
        `
      }

    </div>

    ${
      payment
      ?`

      <div class="order-section">

        <h3>💳 Payment</h3>

        <div class="detail-row">

            <span>Status</span>

            <span class="status-chip">

                ${payment.method}

                ·

                ${payment.status}

            </span>

        </div>

        ${
          payment.reference_number
          ?`

          <div class="detail-row">

              <span>Reference</span>

              <strong>${escapeHtml(payment.reference_number)}</strong>

          </div>

          `
          :""
        }

        ${
          payment.status!=="verified"
          ?`

          <button
              class="btn btn-block"
              id="confirm-parcel-payment-btn">

              Verify Payment

          </button>

          `
          :""
        }

      </div>

      `
      :""
    }

    ${
      payment?.status==="verified"
      ?`

      <div class="order-section">

        <h3>📍 Shipment Status</h3>

        <select id="status-select">

          ${[
            "confirmed",
            "in_transit",
            "out_for_delivery",
            "delivered",
            "ready_for_pickup"
          ].map(s=>`

            <option
                value="${s}"
                ${order.status===s?"selected":""}>

                ${s.replace(/_/g," ")}

            </option>

          `).join("")}

        </select>

        <button
            class="btn btn-block"
            id="status-update-btn">

            Update Status

        </button>

      </div>

      `
      :""
    }

  `;
}
function customQuoteInputValue(parcel) {
  if (parcel.quote_amount == null || parcel.suggested_amount == null) {
    return "";
  }
  if (Number(parcel.quote_amount) !== Number(parcel.suggested_amount)) {
    return parcel.quote_amount;
  }
  return "";
}

function handlerSummary(parcel, prefix) {
  const type = parcel[`${prefix}_handler_type`];
  if (type === "own_agent")
    return `Own agent — ${escapeHtml(parcel[`${prefix}_agent_name`])} (${escapeHtml(parcel[`${prefix}_agent_phone`])})`;
  if (type === "self_pickup") return `Fixed pickup point`;
  return `Tumya delivers — ${escapeHtml(parcel[`${prefix}_address`] || "")}`;
}

function wireOrderDetailActions(order, parcel, payment) {
  const revealBtn = document.getElementById("reveal-qr-btn");
  if (revealBtn)
    revealBtn.addEventListener("click", async () => {
      try {
        const { upi_link, amount } = await AdminApi.revealQr(order.id);
        document.getElementById("qr-area").innerHTML = `
            <div class="qr-box">

                <div style="font-weight:700;font-size:18px;margin-bottom:8px;">
                    Scan to Pay
                </div>

                <div style="margin-bottom:16px;color:var(--ink-soft);">
                    Amount: <strong>₹${amount}</strong>
                </div>

                <img
                    src="/images/upi_qr.jpeg"
                    alt="UPI QR"
                    style="
                        width:260px;
                        max-width:100%;
                        border-radius:12px;
                        display:block;
                        margin:0 auto;
                    "
                >

            </div>
        `;
      } catch (err) {
        toast(err.message, true);
      }
    });

  const confirmPaymentBtn = document.getElementById("confirm-payment-btn");
  if (confirmPaymentBtn)
    confirmPaymentBtn.addEventListener("click", async () => {
      try {
        await AdminApi.confirmCodPayment(order.id);
        toast("Marked paid ✓");
        // Remove the Mark Paid button
        confirmPaymentBtn.remove();
        // Enable the Complete Delivery button if it exists
        const deliverBtn = document.getElementById("status-update-btn");
        if (deliverBtn && deliverBtn.dataset.next === "delivered") {
          deliverBtn.disabled = false;
          deliverBtn.title = "";
          deliverBtn.textContent = "Complete Delivery";
        }
      } catch (err) {
        toast(err.message, true);
      }
    });

  const statusBtn = document.getElementById("status-update-btn");

  if (statusBtn) {
      statusBtn.addEventListener("click", async () => {
          try {
              const statusSelect = document.getElementById("status-select");
              const nextStatus = statusSelect
                ? statusSelect.value
                : statusBtn.dataset.next;

              if (!nextStatus) {
                return toast("Select a status first", true);
              }

              await AdminApi.updateStatus(order.id, nextStatus);

              toast("Status updated");

              renderOrderDetail(order.id);

          } catch (err) {

              toast(err.message, true);

          }

      });

  }

  const weightInput = document.getElementById("weight-input");
  if (weightInput) {
    let previewTimer;
    weightInput.addEventListener("input", () => {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(async () => {
        const weight = Number(weightInput.value);
        const suggestedEl = document.getElementById("suggested-amount");
        if (!suggestedEl || !weight || weight <= 0) {
          if (suggestedEl) suggestedEl.textContent = "—";
          return;
        }
        try {
          const preview = await AdminApi.previewParcelWeight(order.id, weight);
          if (preview.suggested_amount != null) {
            suggestedEl.textContent = `₹${preview.suggested_amount}`;
          }
        } catch {
          // Preview is best-effort; save still validates on submit.
        }
      }, 400);
    });
  }

  const saveQuoteBtn = document.getElementById("save-quote-btn");
  if (saveQuoteBtn)
    saveQuoteBtn.addEventListener("click", async () => {
      const weightInput = document.getElementById("weight-input");
      const customInput = document.getElementById("custom-quote-input");
      const weight = Number(weightInput?.value);
      const customRaw = customInput?.value?.trim();

      if (!weight || weight <= 0) {
        return toast("Enter a valid weight", true);
      }

      const payload = { weight_kg: weight };
      if (customRaw) {
        const customAmount = Number(customRaw);
        if (!customAmount || customAmount <= 0) {
          return toast("Custom quote must be a positive number", true);
        }
        payload.custom_amount = customAmount;
      }

      try {
        const result = await AdminApi.updateParcelQuote(order.id, payload);
        const suggestedEl = document.getElementById("suggested-amount");
        if (suggestedEl && result.suggested_amount != null) {
          suggestedEl.textContent = `₹${result.suggested_amount}`;
        }
        toast(result.is_first_quote ? "Quote sent" : "Quote updated");
        renderOrderDetail(order.id);
      } catch (err) {
        toast(err.message, true);
      }
    });

  const confirmParcelBtn = document.getElementById(
    "confirm-parcel-payment-btn",
  );
  if (confirmParcelBtn)
    confirmParcelBtn.addEventListener("click", async () => {
      try {
        await AdminApi.confirmParcelPayment(order.id);
        toast("Payment verified");
        renderOrderDetail(order.id);
      } catch (err) {
        toast(err.message, true);
      }
    });
}


function nextActionButton(order) {

  if (order.type === "catalog") {

    switch (order.status) {
      
      case "booking":
        return `<button class="btn btn-sm btn-block" onclick="event.stopPropagation(); confirmBookingAction(${order.id})">
          Confirm Order
        </button>`;

      case "pending":
        return `<button class="btn btn-sm btn-block" onclick="advanceOrder(${order.id}, 'confirmed')">
          Confirm Order
        </button>`;

      case "confirmed":
        return `<button class="btn btn-sm btn-block" onclick="advanceOrder(${order.id}, 'out_for_delivery')">
          Start Delivery
        </button>`;

      case "out_for_delivery":
        return `<button class="btn btn-sm btn-block" onclick="openOrder(${order.id})">
          Complete Delivery
        </button>`;

      case "delivered":
        return `<span class="badge badge-success">Done</span>`;
    }

  }

  return "";
}

async function advanceOrder(id, status) {

  try {

    await AdminApi.updateStatus(id, status);

    await renderOrders(document.getElementById("view"));

  } catch (err) {

    alert(err.message);

  }

}

function openOrder(id){
    renderOrderDetail(id);
}

window.openOrder = openOrder;

async function confirmBookingAction(id) {
  try {
    await AdminApi.confirmBooking(id);
    toast("Booking confirmed!");
    goto("orders");
  } catch (err) {
    toast("Failed to confirm booking: " + err.message);
  }
}

window.advanceOrder = advanceOrder;
window.confirmBookingAction = confirmBookingAction;
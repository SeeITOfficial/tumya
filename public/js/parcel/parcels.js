import { Api } from "../api.js";
import { escapeHtml } from "../shared/utils.js";
import { goto } from "../app.js";
import { getPickupPointsCache } from "./wizard.js";

export function handlerFields(prefix) {
  const pickupPointsCache = getPickupPointsCache();
  const pointOptions = pickupPointsCache
    .map(
      (p) =>
        `<option value="${p.id}">${escapeHtml(p.name)} — ${escapeHtml(p.area)}</option>`,
    )
    .join("");
  return `
    <label>How will it be ${prefix === "pickup" ? "collected" : "delivered"}?</label>
    <select id="${prefix}-handler">
      <option value="you_deliver">Tumya team handles it</option>
      <option value="self_pickup">Fixed pickup point</option>
      <option value="own_agent">My own person (agent)</option>
    </select>
    <div id="${prefix}-extra">
      <label>Address</label>
      <input id="${prefix}-address" placeholder="Full address" />
    </div>
  `;
}

export function toggleHandlerFields(prefix, type) {
  const pickupPointsCache = getPickupPointsCache();
  const extra = document.getElementById(`${prefix}-extra`);
  if (type === "self_pickup") {
    const pointOptions = pickupPointsCache
      .map(
        (p) =>
          `<option value="${p.id}">${escapeHtml(p.name)} — ${escapeHtml(p.area)}</option>`,
      )
      .join("");
    extra.innerHTML = `<label>Pickup point</label><select id="${prefix}-point">${pointOptions}</select>`;
  } else if (type === "own_agent") {
    extra.innerHTML = `
      <label>Agent name</label><input id="${prefix}-agent-name" placeholder="Full name" />
      <label>Agent phone</label><input id="${prefix}-agent-phone" placeholder="+256 7XX XXX XXX" />
    `;
  } else {
    extra.innerHTML = `<label>Address</label><input id="${prefix}-address" placeholder="Full address" />`;
  }
}

export async function submitParcel() {
  const errEl = document.getElementById("parcel-error");
  errEl.style.display = "none";

  const payload = {
    send_or_receive: document.getElementById("p-sr").value,
    direction: document.getElementById("p-direction").value,
    description: document.getElementById("p-desc").value.trim(),
  };
  if (!payload.description) {
    errEl.textContent = "Please describe the item.";
    errEl.style.display = "block";
    return;
  }

  for (const prefix of ["pickup", "drop"]) {
    const type = document.getElementById(`${prefix}-handler`).value;
    payload[`${prefix}_handler_type`] = type;
    if (type === "self_pickup")
      payload[`${prefix}_point_id`] = Number(
        document.getElementById(`${prefix}-point`).value,
      );
    else if (type === "own_agent") {
      payload[`${prefix}_agent_name`] = document
        .getElementById(`${prefix}-agent-name`)
        .value.trim();
      payload[`${prefix}_agent_phone`] = document
        .getElementById(`${prefix}-agent-phone`)
        .value.trim();
    } else {
      payload[`${prefix}_address`] = document
        .getElementById(`${prefix}-address`)
        .value.trim();
    }
  }

  try {
    const { order } = await Api.submitParcel(payload);
    const view = document.getElementById("view");
    view.innerHTML = `
      <div class="card success-card">
        <div class="success-icon">📮</div>
        <h2 class="success-title">Parcel submitted</h2>
        <p class="success-copy">Your Order ID:</p>
        <div class="badge success-badge">${order.tracking_code}</div>
        <p class="success-note">Our team will weigh it and send you a quote shortly.</p>
        <button class="btn btn-block success-action" id="back-home-btn2">Back to shop</button>
      </div>
    `;
    document
      .getElementById("back-home-btn2")
      .addEventListener("click", () => goto("home"));
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = "block";
  }
}

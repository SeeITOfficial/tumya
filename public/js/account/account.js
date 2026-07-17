import { Api } from "../api.js";
import { escapeHtml } from "../shared/utils.js";
import { goto, renderLogin } from "../app.js";

// --- Account ---
export async function renderAccount(view) {
  const user = Api.currentUser();
  let orders = [];
  try {
    orders = await Api.myOrders();
  } catch {}

  view.innerHTML = `
    <div class="card account-card">
      <div class="account-name">${escapeHtml(user?.name || "You")}</div>
      <div class="account-phone">${escapeHtml(user?.phone || "")}</div>
    </div>
    <h3 class="section-title">Your orders</h3>
    ${
      orders.length === 0
        ? `<div class="empty-state">No orders yet.</div>`
        : orders
            .map(
              (o) => `
        <div class="card order-item" data-track="${o.tracking_code}">
          <div class="order-item-head">
            <span class="badge">${escapeHtml(o.tracking_code)}</span>
            <span class="order-item-status">${o.status.replace(/_/g, " ")}</span>
          </div>
          <div class="order-item-meta">
            ${o.type === "catalog" ? "Catalog order" : "Parcel"} · ${new Date(o.created_at).toLocaleDateString()}
          </div>
        </div>
      `,
            )
            .join("")
    }
    <button class="btn btn-outline btn-block form-action-secondary" id="logout-btn">Log out</button>
  `;
  document.querySelectorAll("[data-track]").forEach((el) =>
    el.addEventListener("click", () => {
      history.replaceState(null, "", `/?track=${el.dataset.track}`);
      goto("track");
    }),
  );
  document.getElementById("logout-btn").addEventListener("click", () => {
    Api.clearToken();
    renderLogin();
  });
}

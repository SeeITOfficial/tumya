// --- Admin API client (separate token namespace from customer app) ---
const AdminApi = (() => {
  function token() {
    return localStorage.getItem("tumya_admin_token");
  }
  function setToken(t) {
    localStorage.setItem("tumya_admin_token", t);
  }
  function clearToken() {
    localStorage.removeItem("tumya_admin_token");
  }
  function currentUser() {
    const raw = localStorage.getItem("tumya_admin_user");
    return raw ? JSON.parse(raw) : null;
  }
  function setUser(u) {
    localStorage.setItem("tumya_admin_user", JSON.stringify(u));
  }

  async function request(path, { method = "GET", body } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (token()) headers.Authorization = `Bearer ${token()}`;

    let res;
    try {
      res = await fetch(`/api${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error("Cannot reach the server.");
    }
    let data;
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok)
      throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  return {
    token,
    setToken,
    clearToken,
    currentUser,
    setUser,
    login: (phone, password) =>
      request("/auth/admin/login", {
        method: "POST",
        body: { phone, password },
      }),
    listAdmins: () => request("/auth/admins"),
    getOrders: (status) =>
      request(`/orders${status ? `?status=${status}` : ""}`),
    getOrder: (id) => request(`/orders/${id}`),
    assignOrder: (id, admin_id) =>
      request(`/orders/${id}/assign`, { method: "PATCH", body: { admin_id } }),
    updateStatus: (id, status, note) =>
      request(`/orders/${id}/status`, {
        method: "PATCH",
        body: { status, note },
      }),
    revealQr: (id) => request(`/orders/${id}/reveal-qr`),
    confirmCodPayment: (id, reference_number) =>
      request(`/orders/${id}/payment/confirm`, {
        method: "POST",
        body: { reference_number },
      }),
    weighParcel: (id, weight_kg) =>
      request(`/parcels/${id}/weigh`, { method: "POST", body: { weight_kg } }),
    quoteParcel: (id, quote_amount) =>
      request(`/parcels/${id}/quote`, {
        method: "POST",
        body: { quote_amount },
      }),
    confirmParcelPayment: (id) =>
      request(`/parcels/${id}/payment/confirm`, { method: "POST" }),
    getRates: () => request("/parcels/rates"),
    setRate: (direction, rate_per_kg) =>
      request(`/parcels/rates/${direction}`, {
        method: "PATCH",
        body: { rate_per_kg },
      }),
    getCatalog: () => request("/catalog"),
    addCatalogItem: (payload) =>
      request("/catalog", { method: "POST", body: payload }),
    updateCatalogItem: (id, payload) =>
      request(`/catalog/${id}`, { method: "PATCH", body: payload }),
    deleteCatalogItem: (id) => request(`/catalog/${id}`, { method: "DELETE" }),
    getPickupPoints: () => request("/pickup-points"),
    addPickupPoint: (payload) =>
      request("/pickup-points", { method: "POST", body: payload }),
    deactivatePickupPoint: (id) =>
      request(`/pickup-points/${id}/deactivate`, { method: "PATCH" }),
  };
})();

let activeTab = "orders";
let statusFilter = "";
const app = document.getElementById("app");

function toast(msg, isError = false) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

const CATALOG_STOCK_STATUSES = ["in_stock", "out_of_stock", "coming_soon"];

function stockStatusLabel(status) {
  return status.replace(/_/g, " ");
}

function stockBadgeClass(status) {
  if (status === "in_stock") return "badge-ok";
  if (status === "coming_soon") return "badge";
  return "badge-warn";
}

async function boot() {
  if (!AdminApi.token()) renderLogin();
  else renderShell();
}

function renderLogin() {
  app.innerHTML = `
    <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; background:linear-gradient(160deg, var(--orange-500), var(--orange-700)); padding:20px;">
      <div class="card" style="padding:30px; max-width:360px; width:100%;">
        <div style="text-align:center; margin-bottom:20px;">
          <img src="/icons/icon-192.png" style="width:64px; height:64px; border-radius:16px;" />
          <h1 style="font-size:20px; margin:10px 0 2px;">Tumya Admin</h1>
        </div>
        <label>Phone</label>
        <input id="a-phone" placeholder="+256 7XX XXX XXX" />
        <label>Password</label>
        <input id="a-password" type="password" />
        <button class="btn btn-block" id="a-login-btn" style="margin-top:18px;">Log in</button>
        <p id="a-login-error" style="color:var(--danger); font-size:13px; margin-top:10px; display:none;"></p>
      </div>
    </div>
  `;
  document.getElementById("a-login-btn").addEventListener("click", doLogin);
}

async function doLogin() {
  const phone = document.getElementById("a-phone").value.trim();
  const password = document.getElementById("a-password").value;
  const errEl = document.getElementById("a-login-error");
  errEl.style.display = "none";
  try {
    const { token, user } = await AdminApi.login(phone, password);
    AdminApi.setToken(token);
    AdminApi.setUser(user);
    renderShell();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = "block";
  }
}

function renderShell() {
  const user = AdminApi.currentUser();
  app.innerHTML = `
    <div class="admin-shell">
      <div class="sidebar" style="position:relative;">
        <div class="sidebar-brand"><img src="/icons/icon-192.png" /><span>Tumya</span></div>
        <nav>
          <button data-tab="orders">Orders</button>
          <button data-tab="catalog">Catalog</button>
          <button data-tab="pickup">Pickup Points</button>
          <button data-tab="rates">Parcel Rates</button>
        </nav>
        <div class="sidebar-user">
          ${escapeHtml(user?.name || "")}<br />
          <a href="#" id="a-logout" style="color:#fff;">Log out</a>
        </div>
      </div>
      <div class="admin-main" id="view"></div>
    </div>
  `;
  document
    .querySelectorAll(".sidebar nav button")
    .forEach((b) => b.addEventListener("click", () => goto(b.dataset.tab)));
  document.getElementById("a-logout").addEventListener("click", (e) => {
    e.preventDefault();
    AdminApi.clearToken();
    renderLogin();
  });
  goto("orders");
}

async function goto(tab) {
  activeTab = tab;
  document
    .querySelectorAll(".sidebar nav button")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  const view = document.getElementById("view");
  view.innerHTML = `<div class="empty-state">Loading...</div>`;
  try {
    if (tab === "orders") await renderOrders(view);
    else if (tab === "catalog") await renderCatalog(view);
    else if (tab === "pickup") await renderPickupPoints(view);
    else if (tab === "rates") await renderRates(view);
  } catch (err) {
    view.innerHTML = `<div class="empty-state">${err.message}</div>`;
  }
}

// --- Orders ---
const STATUS_FILTERS = [
  "",
  "pending_quote",
  "quoted",
  "payment_pending",
  "confirmed",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "ready_for_pickup",
];

async function renderOrders(view) {
  const orders = await AdminApi.getOrders(statusFilter || undefined);

  const pendingQuotes = orders.filter(
    (o) => o.status === "pending_quote",
  ).length;

  const paymentPending = orders.filter(
    (o) => o.status === "payment_pending",
  ).length;

  const inTransit = orders.filter(
    (o) => o.status === "in_transit",
  ).length;

  const revenue = orders
    .filter((o) => o.total_amount != null)
    .reduce((sum, o) => sum + Number(o.total_amount), 0);

  view.innerHTML = `
    <h2>Dashboard</h2>

    <div class="stats-grid">

      <div class="stat-card" data-filter="">
        <div class="stat-number">${orders.length}</div>
        <div class="stat-label">Total Orders</div>
      </div>

      <div class="stat-card" data-filter="pending_quote">
        <div class="stat-number">${pendingQuotes}</div>
        <div class="stat-label">Pending Quotes</div>
      </div>

      <div class="stat-card" data-filter="payment_pending">
        <div class="stat-number">${paymentPending}</div>
        <div class="stat-label">Pending Payments</div>
      </div>

      <div class="stat-card" data-filter="in_transit">
        <div class="stat-number">${inTransit}</div>
        <div class="stat-label">In Transit</div>
      </div>

      <div class="stat-card">
        <div class="stat-number">₹${revenue.toFixed(2)}</div>
        <div class="stat-label">Revenue</div>
      </div>

    </div>

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


  document.querySelectorAll(".order-card").forEach((card) =>
    tr.addEventListener("click", () =>
      renderOrderDetail(Number(card.dataset.id)),
    ),
  );
}


async function renderOrderDetail(id) {
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
                : "🛒 Catalog Order"}
        </h2>

        <div class="hero-customer">

            <strong>${escapeHtml(order.customer_name)}</strong>

            <div class="hero-phone">

                ${escapeHtml(order.customer_phone)}

            </div>

        </div>

        <div class="hero-section">

            <label>Handled By</label>

            <select id="assign-select">

                <option value="">
                    — Unassigned —
                </option>

                ${admins.map(a => `
                    <option
                        value="${a.id}"
                        ${order.handled_by_admin_id===a.id?"selected":""}>
                        ${escapeHtml(a.name)}
                    </option>
                `).join("")}

            </select>

        </div>

    </div>
    ${order.type === "catalog" ? catalogOrderDetailHtml(order, items, payment) : parcelOrderDetailHtml(order, parcel, payment)}

    <div class="card" style="padding:16px; margin-top:16px;">
      <h3 style="font-size:14px; margin:0 0 10px;">History</h3>
      <ul class="timeline">
        ${history.map((h) => `<li class="done"><div class="t-status">${h.status.replace(/_/g, " ")}</div>${h.note ? `<div style="font-size:13px;color:var(--ink-soft);">${escapeHtml(h.note)}</div>` : ""}<div class="t-time">${new Date(h.timestamp).toLocaleString()}</div></li>`).join("")}
      </ul>
    </div>
  `;

  document
    .getElementById("back-btn")
    .addEventListener("click", () => goto("orders"));
  document
    .getElementById("assign-select")
    .addEventListener("change", async (e) => {
      try {
        await AdminApi.assignOrder(
          order.id,
          e.target.value ? Number(e.target.value) : null,
        );
        toast("Assigned");
      } catch (err) {
        toast(err.message, true);
      }
    });

  wireOrderDetailActions(order, parcel, payment);
}

function catalogOrderDetailHtml(order, items, payment) {
  return `
    <div class="card" style="padding:16px; margin-bottom:16px;">
      <h3 style="font-size:14px; margin:0 0 10px;">Items</h3>
      ${(items || [])
        .map(
          (
            i,
          ) => `<div style="display:flex; justify-content:space-between; padding:4px 0; font-size:14px;">
        <span>Item #${i.catalog_item_id} × ${i.qty}</span><span>₹${i.unit_price}</span>
      </div>`,
        )
        .join("")}
      <div style="font-weight:700; margin-top:8px; border-top:1px solid var(--line); padding-top:8px;">Total: ₹${order.total_amount}</div>

      <div style="margin-top:16px;">
        <div>Payment: <span class="badge ${payment?.status === "verified" ? "badge-ok" : "badge-warn"}">${payment?.method} — ${payment?.status}</span></div>
        ${order.payment_mode === "cod_upi_scan" && payment?.status !== "verified" ? `<button class="btn btn-sm" id="reveal-qr-btn" style="margin-top:10px;">Reveal QR at handoff</button><div id="qr-area" style="margin-top:12px;"></div>` : ""}
        ${payment?.status !== "verified" ? `<button class="btn btn-sm btn-outline" id="confirm-payment-btn" style="margin-top:10px; margin-left:8px;">Mark paid</button>` : ""}
      </div>

      <div style="margin-top:16px;">
        <label style="margin-top:0;">Advance status</label>
        <select id="status-select">
          ${["confirmed", "in_transit", "out_for_delivery", "delivered"].map((s) => `<option value="${s}" ${order.status === s ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`).join("")}
        </select>
        <button class="btn btn-sm" id="status-update-btn" style="margin-top:10px;">Update status</button>
      </div>
    </div>
  `;
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
        !parcel.weight_kg
        ?`

        <input
            id="weight-input"
            type="number"
            step="0.1"
            placeholder="Weight in kg">

        <button
            class="btn btn-block"
            id="weigh-btn">

            Calculate Quote

        </button>

        `
        :`

        <div class="detail-row">

            <span>Weight</span>

            <strong>${parcel.weight_kg} kg</strong>

        </div>

        ${
          !parcel.quote_amount
          ?`

            <div class="detail-row">

                <span>Suggested</span>

                <strong>${parcel.suggested_amount}</strong>

            </div>

            <input
                id="quote-input"
                type="number"
                step="0.01"
                value="${parcel.suggested_amount ?? ""}">

            <button
                class="btn btn-block"
                id="quote-btn">

                Send Quote

            </button>

          `
          :`

            <div class="detail-row">

                <span>Quoted</span>

                <strong>${parcel.quote_amount}</strong>

            </div>

          `
        }

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
          <div style="font-weight:700; margin-bottom:8px;">Show this to the customer to scan — ₹${amount}</div>
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upi_link)}" width="200" height="200" />
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
        toast("Marked paid");
        renderOrderDetail(order.id);
      } catch (err) {
        toast(err.message, true);
      }
    });

  const statusBtn = document.getElementById("status-update-btn");
  if (statusBtn)
    statusBtn.addEventListener("click", async () => {
      const status = document.getElementById("status-select").value;
      try {
        await AdminApi.updateStatus(order.id, status);
        toast("Status updated");
        renderOrderDetail(order.id);
      } catch (err) {
        toast(err.message, true);
      }
    });

  const weighBtn = document.getElementById("weigh-btn");
  if (weighBtn)
    weighBtn.addEventListener("click", async () => {
      const w = Number(document.getElementById("weight-input").value);
      if (!w || w <= 0) return toast("Enter a valid weight", true);
      try {
        await AdminApi.weighParcel(order.id, w);
        toast("Weighed");
        renderOrderDetail(order.id);
      } catch (err) {
        toast(err.message, true);
      }
    });

  const quoteBtn = document.getElementById("quote-btn");
  if (quoteBtn)
    quoteBtn.addEventListener("click", async () => {
      const amt = Number(document.getElementById("quote-input").value);
      if (!amt || amt <= 0) return toast("Enter a valid amount", true);
      try {
        await AdminApi.quoteParcel(order.id, amt);
        toast("Quoted");
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

// --- Catalog management ---
async function renderCatalog(view) {
  const items = await AdminApi.getCatalog();

  view.innerHTML = `
    <h2>Catalog</h2>

    <button
      class="btn btn-sm"
      id="add-item-btn"
      style="margin-bottom:16px;">
      + Add Item
    </button>

    ${
      items.length === 0
        ? `
          <div class="empty-state">
            No catalog items yet.
          </div>
        `
        : `
          <div class="orders-mobile">

            ${items.map(item => `

              <div class="order-card">

                <div class="order-card-top">

                  <strong>
                    ${escapeHtml(item.name)}
                  </strong>

                  <span class="status-chip">
                    ${item.stock_status.replace(/_/g, " ")}
                  </span>

                </div>

                ${
                  item.photo_url
                    ? `
                      <img
                        src="${item.photo_url}"
                        style="
                          width:100%;
                          height:180px;
                          object-fit:cover;
                          border-radius:12px;
                          margin:12px 0;
                        ">
                    `
                    : ""
                }

                <div class="order-footer">

                  <strong>
                    ₹${item.price} / ${escapeHtml(item.unit)}
                  </strong>

                </div>

                <div
                  style="
                    display:flex;
                    gap:10px;
                    margin-top:16px;
                    flex-wrap:wrap;
                  ">

                  <select
                    data-stock-select="${item.id}"
                    class="input"
                    style="flex:1;">

                    <option value="in_stock"
                      ${item.stock_status === "in_stock" ? "selected" : ""}>
                      In Stock
                    </option>

                    <option value="out_of_stock"
                      ${item.stock_status === "out_of_stock" ? "selected" : ""}>
                      Out of Stock
                    </option>

                    <option value="coming_soon"
                      ${item.stock_status === "coming_soon" ? "selected" : ""}>
                      Coming Soon
                    </option>

                  </select>

                  <button
                    class="btn btn-sm"
                    data-save-stock="${item.id}">
                    Save
                  </button>

                  <button
                    class="btn btn-sm"
                    data-edit-item="${item.id}">
                    Edit
                  </button>

                  <button
                    class="btn btn-sm btn-danger"
                    data-delete="${item.id}">
                    Delete
                  </button>

                </div>

              </div>

            `).join("")}

          </div>
        `
    }
  `;

  document
    .getElementById("add-item-btn")
    .addEventListener("click", () => showCatalogModal());

  document.querySelectorAll("[data-edit-item]").forEach((b) =>
    b.addEventListener("click", () => {
      const item = items.find(
        (row) => row.id === Number(b.dataset.editItem)
      );
      showCatalogModal(item);
    }),
  );

  document.querySelectorAll("[data-save-stock]").forEach((b) =>
    b.addEventListener("click", async () => {
      const select = document.querySelector(
        `[data-stock-select="${b.dataset.saveStock}"]`,
      );

      if (!select) return;

      try {
        await AdminApi.updateCatalogItem(Number(b.dataset.saveStock), {
          stock_status: select.value,
        });

        goto("catalog");
      } catch (err) {
        toast(err.message, true);
      }
    }),
  );

  document.querySelectorAll("[data-delete]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Delete this item?")) return;

      try {
        await AdminApi.deleteCatalogItem(Number(b.dataset.delete));
        goto("catalog");
      } catch (err) {
        toast(err.message, true);
      }
    }),
  );
}
function showCatalogModal(item = null) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const state = {
    photo1: item?.photo_url || null,
    photo2: item?.photo_url_2 || null,
  };
  overlay.innerHTML = `
    <div class="modal">
      <button class="modal-close" id="modal-close">&times;</button>
      <h3>${item ? "Edit catalog item" : "Add catalog item"}</h3>
      <label>Name</label><input id="ci-name" value="${escapeHtml(item?.name || "")}" />
      <label>Unit</label><input id="ci-unit" placeholder="kg, bunch, piece" value="${escapeHtml(item?.unit || "")}" />
      <label>Price (₹)</label><input id="ci-price" type="number" step="0.01" value="${item?.price ?? ""}" />
      <label>Stock status</label>
      <select id="ci-stock-status">
        ${CATALOG_STOCK_STATUSES.map((status) => `<option value="${status}" ${(item?.stock_status || "in_stock") === status ? "selected" : ""}>${stockStatusLabel(status)}</option>`).join("")}
      </select>
      <div class="photo-picker">
        <div class="photo-picker-header">
          <div>
            <div class="photo-picker-title">Item photos</div>
            <div class="photo-picker-subtitle">Take a photo with the camera or choose from the gallery. Images are compressed before saving.</div>
          </div>
          <div class="photo-picker-count">Up to 2</div>
        </div>
        <div class="photo-grid">
          <div class="photo-slot">
            <div class="photo-slot-label">Main photo</div>
            <div class="photo-preview" id="ci-photo-1-preview">${state.photo1 ? `<img src="${state.photo1}" alt="Main preview" />` : "<span>No photo selected</span>"}</div>
            <input id="ci-photo-1" class="photo-input" type="file" accept="image/*" />
            <div class="photo-slot-actions">
              <button class="btn btn-sm btn-outline photo-slot-btn" type="button" data-photo-camera="1">Camera</button>
              <button class="btn btn-sm btn-outline photo-slot-btn" type="button" data-photo-gallery="1">Gallery</button>
              <button class="btn btn-sm btn-outline photo-slot-btn" type="button" data-photo-clear="1">Remove</button>
            </div>
          </div>
          <div class="photo-slot">
            <div class="photo-slot-label">Second photo</div>
            <div class="photo-preview" id="ci-photo-2-preview">${state.photo2 ? `<img src="${state.photo2}" alt="Second preview" />` : "<span>Optional</span>"}</div>
            <input id="ci-photo-2" class="photo-input" type="file" accept="image/*" />
            <div class="photo-slot-actions">
              <button class="btn btn-sm btn-outline photo-slot-btn" type="button" data-photo-camera="2">Camera</button>
              <button class="btn btn-sm btn-outline photo-slot-btn" type="button" data-photo-gallery="2">Gallery</button>
              <button class="btn btn-sm btn-outline photo-slot-btn" type="button" data-photo-clear="2">Remove</button>
            </div>
          </div>
        </div>
      </div>
      <button class="btn btn-block" id="ci-save" style="margin-top:16px;">Save</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document
    .getElementById("modal-close")
    .addEventListener("click", () => overlay.remove());
  const photo1Input = document.getElementById("ci-photo-1");
  const photo2Input = document.getElementById("ci-photo-2");

  overlay
    .querySelector('[data-photo-camera="1"]')
    .addEventListener("click", () => triggerPhotoInput(photo1Input, true));
  overlay
    .querySelector('[data-photo-gallery="1"]')
    .addEventListener("click", () => triggerPhotoInput(photo1Input, false));
  overlay
    .querySelector('[data-photo-camera="2"]')
    .addEventListener("click", () => triggerPhotoInput(photo2Input, true));
  overlay
    .querySelector('[data-photo-gallery="2"]')
    .addEventListener("click", () => triggerPhotoInput(photo2Input, false));
  overlay
    .querySelector('[data-photo-clear="1"]')
    .addEventListener("click", () => {
      state.photo1 = null;
      photo1Input.value = "";
      document.getElementById("ci-photo-1-preview").innerHTML =
        "<span>No photo selected</span>";
    });
  overlay
    .querySelector('[data-photo-clear="2"]')
    .addEventListener("click", () => {
      state.photo2 = null;
      photo2Input.value = "";
      document.getElementById("ci-photo-2-preview").innerHTML =
        "<span>Optional</span>";
    });

  photo1Input.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      state.photo1 = await compressCatalogPhoto(file);
      document.getElementById("ci-photo-1-preview").innerHTML =
        `<img src="${state.photo1}" alt="Main preview" />`;
    } catch (err) {
      toast(err.message, true);
    }
  });

  photo2Input.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      state.photo2 = await compressCatalogPhoto(file);
      document.getElementById("ci-photo-2-preview").innerHTML =
        `<img src="${state.photo2}" alt="Second preview" />`;
    } catch (err) {
      toast(err.message, true);
    }
  });

  document.getElementById("ci-save").addEventListener("click", async () => {
    const name = document.getElementById("ci-name").value.trim();
    const unit = document.getElementById("ci-unit").value.trim();
    const price = Number(document.getElementById("ci-price").value);
    const stockStatus = document.getElementById("ci-stock-status").value;
    if (!name || !unit || !price) return toast("Fill all fields", true);
    const payload = {
      name,
      unit,
      price,
      stock_status: stockStatus,
      photo_url: state.photo1,
      photo_url_2: state.photo2,
    };
    try {
      if (item?.id) await AdminApi.updateCatalogItem(item.id, payload);
      else await AdminApi.addCatalogItem(payload);
      overlay.remove();
      goto("catalog");
    } catch (err) {
      toast(err.message, true);
    }
  });
}

function triggerPhotoInput(input, useCamera) {
  if (useCamera) input.setAttribute("capture", "environment");
  else input.removeAttribute("capture");
  input.click();
}

async function compressCatalogPhoto(file) {
  const imageUrl = await fileToDataUrl(file);
  const image = await loadImage(imageUrl);
  const maxSide = 800;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to process photo.");
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/webp", 0.72);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read photo."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to process photo."));
    image.src = src;
  });
}

// --- Pickup points ---
async function renderPickupPoints(view) {
  const points = await AdminApi.getPickupPoints();
  view.innerHTML = `
    <h2>Pickup Points</h2>
    <div class="card" style="padding:16px; margin-bottom:16px;">
      <div class="field-row">
        <input id="pp-name" placeholder="Name" />
        <input id="pp-area" placeholder="Area" />
      </div>
      <input id="pp-landmark" placeholder="Landmark (optional)" style="margin-top:10px;" />
      <button class="btn btn-sm" id="pp-add-btn" style="margin-top:10px;">Add pickup point</button>
    </div>
    <table class="data-table">
      <thead><tr><th>Name</th><th>Area</th><th>Landmark</th><th></th></tr></thead>
      <tbody>
        ${points
          .map(
            (p) => `
          <tr>
            <td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.area)}</td><td>${escapeHtml(p.landmark || "—")}</td>
            <td><button class="btn btn-sm btn-outline" data-deactivate="${p.id}">Remove</button></td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
  document.getElementById("pp-add-btn").addEventListener("click", async () => {
    const name = document.getElementById("pp-name").value.trim();
    const area = document.getElementById("pp-area").value.trim();
    const landmark = document.getElementById("pp-landmark").value.trim();
    if (!name || !area) return toast("Name and area required", true);
    try {
      await AdminApi.addPickupPoint({ name, area, landmark });
      goto("pickup");
    } catch (err) {
      toast(err.message, true);
    }
  });
  document.querySelectorAll("[data-deactivate]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await AdminApi.deactivatePickupPoint(Number(b.dataset.deactivate));
        goto("pickup");
      } catch (err) {
        toast(err.message, true);
      }
    }),
  );
}

// --- Rates ---
async function renderRates(view) {
  const rates = await AdminApi.getRates();
  view.innerHTML = `
    <h2>Parcel Rates</h2>
    ${rates
      .map(
        (r) => `
      <div class="card" style="padding:16px; margin-bottom:12px;">
        <div style="font-weight:700; text-transform:capitalize;">${r.direction.replace(/_/g, " ")}</div>
        <div class="field-row" style="margin-top:10px;">
          <input id="rate-${r.direction}" type="number" step="0.01" value="${r.rate_per_kg}" />
          <span style="align-self:center;">${r.currency}/kg</span>
          <button class="btn btn-sm" data-save-rate="${r.direction}">Save</button>
        </div>
      </div>
    `,
      )
      .join("")}
  `;
  document.querySelectorAll("[data-save-rate]").forEach((b) =>
    b.addEventListener("click", async () => {
      const val = Number(
        document.getElementById(`rate-${b.dataset.saveRate}`).value,
      );
      if (!val || val <= 0) return toast("Enter a valid rate", true);
      try {
        await AdminApi.setRate(b.dataset.saveRate, val);
        toast("Rate updated");
      } catch (err) {
        toast(err.message, true);
      }
    }),
  );
}

boot();

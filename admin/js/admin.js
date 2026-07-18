import { escapeHtml } from "./shared/utils.js";
import { renderOrders } from "./orders/orders.js";
import { renderCatalog } from "./catalog/catalog.js";
import { renderPickupPoints } from "./pickup/pickup.js";
import { renderRates } from "./rates/rates.js";

// --- Admin API client (separate token namespace from customer app) ---
export const AdminApi = (() => {
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
    const headers = {};

    if (token()) {
      headers.Authorization = `Bearer ${token()}`;
    }

    const options = {
      method,
      headers,
    };

    if (body instanceof FormData) {
      options.body = body;
    } else if (body) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    let res;

    try {
      res = await fetch(`/api${path}`, options);
    } catch {
      throw new Error("Cannot reach the server.");
    }

    let data;

    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }

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
const app = document.getElementById("app");

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

export async function goto(tab) {
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

boot();

import { AdminApi } from "../admin.js";
import { escapeHtml } from "../shared/utils.js";

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + (iso.includes('Z') ? '' : 'Z'));
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export async function renderCustomers(view) {
  let customers = await AdminApi.getCustomers();
  let query = "";

  function filtered() {
    if (!query.trim()) return customers;
    const q = query.trim().toLowerCase();
    return customers.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q)
    );
  }

  function renderTable() {
    const list = filtered();
    const tableEl = view.querySelector("#customers-table-wrap");
    if (!tableEl) return;

    if (list.length === 0) {
      tableEl.innerHTML = `<div class="empty-state">${query ? "No customers match your search." : "No customers have signed up yet."}</div>`;
      return;
    }

    tableEl.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Joined</th>
            <th style="text-align:center;">Orders</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map(
              (c, i) => `
            <tr>
              <td style="color:var(--ink-soft);font-size:12px;">${i + 1}</td>
              <td><strong>${escapeHtml(c.name || "—")}</strong></td>
              <td>
                <a href="mailto:${escapeHtml(c.email || "")}" style="color:var(--orange-500);text-decoration:none;">
                  ${escapeHtml(c.email || "—")}
                </a>
              </td>
              <td>${escapeHtml(c.phone || "—")}</td>
              <td style="color:var(--ink-soft);font-size:13px;">${formatDate(c.created_at)}</td>
              <td style="text-align:center;">
                <span class="badge" style="${c.order_count > 0 ? "background:var(--orange-100);color:var(--orange-600);" : ""}">
                  ${c.order_count}
                </span>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  view.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
      <div>
        <h2 style="margin:0;font-size:20px;">Customers</h2>
        <p style="margin:4px 0 0;color:var(--ink-soft);font-size:13px;">
          All accounts signed up on Tumya
          <span id="cust-count" style="margin-left:6px;background:var(--orange-100);color:var(--orange-600);padding:2px 8px;border-radius:99px;font-size:12px;font-weight:600;">
            ${customers.length}
          </span>
        </p>
      </div>
      <input
        id="cust-search"
        type="search"
        placeholder="Search name, email or phone…"
        style="padding:9px 14px;border:1px solid var(--border);border-radius:10px;font-size:14px;width:260px;outline:none;"
      />
    </div>

    <div id="customers-table-wrap"></div>
  `;

  renderTable();

  view.querySelector("#cust-search").addEventListener("input", (e) => {
    query = e.target.value;
    renderTable();
  });
}

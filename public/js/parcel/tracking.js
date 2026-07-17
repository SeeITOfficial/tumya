import { Api } from "../api.js";
import { escapeHtml } from "../shared/utils.js";

// --- Track ---
export async function renderTrack(view) {

  view.innerHTML = `
    <h2 class="page-title">My Parcels</h2>

    <div id="parcel-list" class="empty-state">
      Loading...
    </div>
  `;

  const container = document.getElementById("parcel-list");

  try {

    const orders = await Api.myOrders();

    if (!orders.length) {
      container.innerHTML = `
        <div class="empty-state">
          You haven't created any parcels yet.
        </div>
      `;
      return;
    }

    container.innerHTML = orders.map(order => `

      <div class="card parcel-card"
           onclick="doTrack('${order.tracking_code}')">

        <div class="parcel-top">

          <strong>${order.type === "parcel" ? "📦 Parcel" : "🛒 Catalog Order"}</strong>

          <span class="badge">
            ${order.status.replaceAll("_"," ")}
          </span>

        </div>

        <div style="margin-top:8px;color:#666;">

          ${order.tracking_code}

        </div>

        <div style="margin-top:12px;">

          <button class="btn btn-sm">

            View Details

          </button>

        </div>

      </div>

    `).join("");

  } catch(err){

    container.innerHTML = `
      <div class="empty-state">
        ${err.message}
      </div>
    `;

  }

}

export async function doTrack(code = null) {

  if (!code) {
    const input = document.getElementById("track-code");
    if (!input) return;
    code = input.value.trim().toUpperCase();
  }

  if (!code) return;

  const resultEl =
    document.getElementById("track-result") ||
    document.getElementById("parcel-list");

  resultEl.innerHTML = `<div class="empty-state">Loading...</div>`;

  try {

    const { order, history } = await Api.track(code);

    resultEl.innerHTML = `

      <button
        class="btn btn-secondary"
        id="backParcels"
        style="margin-bottom:20px;">
        ← Back to My Parcels
      </button>

      <div class="card track-card">

        <div class="track-card-head">

          <span class="badge">
            ${escapeHtml(order.tracking_code)}
          </span>

          <span class="track-status">
            ${order.status.replace(/_/g, " ")}
          </span>

        </div>

        <ul class="timeline">

          ${history.map(h => `

            <li class="done">

              <div class="t-status">
                ${h.status.replace(/_/g, " ")}
              </div>

              ${
                h.note
                  ? `
                  <div class="timeline-note">
                    ${escapeHtml(h.note)}
                  </div>
                `
                  : ""
              }

              <div class="t-time">
                ${new Date(h.timestamp).toLocaleString()}
              </div>

            </li>

          `).join("")}

        </ul>

      </div>

    `;

    document.getElementById("backParcels").onclick = () => {
      renderTrack(document.getElementById("view"));
    };

  } catch (err) {

    resultEl.innerHTML = `
      <div class="empty-state">
        ${err.message}
      </div>
    `;

  }

}

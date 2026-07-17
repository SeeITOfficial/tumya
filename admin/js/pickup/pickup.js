import { goto, AdminApi } from "../admin.js";
import { toast, escapeHtml } from "../shared/utils.js";

// --- Pickup points ---
export async function renderPickupPoints(view) {
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

import { AdminApi } from "../admin.js";
import { toast } from "../shared/utils.js";

// --- Rates ---
export async function renderRates(view) {
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

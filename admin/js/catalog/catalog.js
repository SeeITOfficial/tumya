import { goto, AdminApi } from "../admin.js";
import {
  toast,
  escapeHtml,
  CATALOG_STOCK_STATUSES,
  stockStatusLabel,
} from "../shared/utils.js";

// --- Catalog management ---
export async function renderCatalog(view) {
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

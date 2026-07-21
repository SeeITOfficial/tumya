import { Api } from "../api.js";
import { escapeHtml } from "../shared/utils.js";
import { toast } from "../shared/ui.js";
import { addToCart, renderCartBar } from "./cart.js";

let catalogCache = [];
let selectedProduct = null;
let productQty = 1;
let currentImages = [];

export function getCatalogCache() {
    return catalogCache;
}

export async function renderHome(view) {
    catalogCache = await Api.getCatalog();

    if (catalogCache.length === 0) {
        view.innerHTML = `<div class="empty-state">No items listed yet. Check back soon, or use "Send/Receive" to request anything.</div>`;
        return;
    }

    view.innerHTML = `
        <div class="product-grid">
            ${catalogCache.map(itemCard).join("")}
        </div>
        <div id="cart-bar"></div>
    `;
    document
        .querySelectorAll("[data-add]")
        .forEach((btn) =>
            btn.addEventListener("click", () => addToCart(Number(btn.dataset.add))),
        );
    renderCartBar();
}

function itemCard(item) {
    const canOrder = item.stock_status !== "out_of_stock";
    const statusClass =
        item.stock_status === "in_stock"
            ? "status-in-stock"
            : item.stock_status === "coming_soon"
                ? "status-coming-soon"
                : "status-out-of-stock";

    let button;

    if (item.stock_status === "coming_soon") {
        button = `<button class="btn btn-sm btn-block" data-add="${item.id}" onclick="event.stopPropagation()">Book</button>`;
    } else if (item.stock_status === "in_stock") {
        button = `<button class="btn btn-sm btn-block" data-add="${item.id}" onclick="event.stopPropagation()">Add to Cart</button>`;
    } else {
        button = `<span class="badge badge-muted">Out of stock</span>`;
    }

    return `
        <div class="card product-card ${statusClass}" onclick="openProduct(${item.id})">
            <div class="product-card-media ${item.photo_url ? "" : "product-card-media--empty"}">
                ${
                    item.photo_url
                        ? `<img src="${item.photo_url}" class="product-card-image" loading="lazy" decoding="async" />`
                        : `<div class="product-card-placeholder">
                                 <span class="product-card-placeholder-icon">🥑</span>
                                 <span class="product-card-placeholder-text">Photo coming soon</span>
                             </div>`
                }
            </div>

            <div class="product-card-title">${escapeHtml(item.name)}</div>
            <div class="product-card-meta">₹${item.price} / ${escapeHtml(item.unit)}</div>

            ${button}
        </div>
    `;
}

export function openProduct(id) {
        const item = catalogCache.find(i => i.id === id);
        if (!item) return;
        productQty = 1;
        const images = [
                item.photo_url,
                item.photo_url_2
        ].filter(Boolean);
        currentImages = images;

        document.body.insertAdjacentHTML("beforeend", `
<div class="product-overlay" onclick="closeProduct()">
        <div class="product-sheet" onclick="event.stopPropagation()">
                <button class="product-close" onclick="closeProduct()">✕</button>
                <div class="product-gallery" id="productGallery">
                        ${images.map((src, i)=>`
                                <img src="${src}" class="product-image" onclick="openImageViewer('${i}', event)">
                        `).join("")}
                </div>
                ${
                        images.length>1
                        ?
                        `<div class="product-dots">
                        ${images.map((_,i)=>`
                                <span class="product-dot ${i===0?"active":""}"></span>
                        `).join("")}
                        </div>`
                        :
                        ""
                }
                <div class="product-body">
                        <h2>${escapeHtml(item.name)}</h2>
                        <div class="product-price">₹${item.price}</div>
                        <div class="product-unit">per ${escapeHtml(item.unit)}</div>
                        <p class="product-description">Fresh quality product supplied by Tumya.</p>
                        <div class="qty-section">
                                <span>Quantity</span>
                                <div class="qty-controls">
                                        <button class="qty-btn" onclick="changeQty(-1,event)">−</button>
                                        <span id="qtyValue">1</span>
                                        <button class="qty-btn" onclick="changeQty(1,event)">+</button>
                                </div>
                        </div>
                </div>
                <div class="product-actions">
                        <button class="btn btn-block" onclick="addToCart(${item.id})">
                                ${item.stock_status==="coming_soon" ? "Book Now" : "Add to Cart"}
                        </button>
                </div>
        </div>
</div>
`);

        const gallery = document.getElementById("productGallery");
        if(gallery){
                gallery.addEventListener("scroll",()=>{
                        const index=Math.round(gallery.scrollLeft/gallery.clientWidth);
                        document.querySelectorAll(".product-dot").forEach((dot,i)=>{
                                dot.classList.toggle("active", i===index);
                        });
                });
        }
}

export function closeProduct() {
        document.querySelector(".product-overlay")?.remove();
}

export function openImageViewer(index, event) {
        event.stopPropagation();
        const overlay = document.createElement("div");
        overlay.className = "image-viewer";
        overlay.innerHTML = `
<div class="viewer-close" onclick="closeImageViewer()">✕</div>
<div class="viewer-count">${index + 1} / ${currentImages.length}</div>
<div class="viewer-gallery">${currentImages.map(src => `<img src="${src}" class="viewer-image">`).join("")}</div>
`;
        document.body.appendChild(overlay);
        const gallery = overlay.querySelector(".viewer-gallery");
        gallery.scrollLeft = gallery.clientWidth * index;
}

export function closeImageViewer(){
        document.querySelector(".image-viewer")?.remove();
}

export function changeQty(change,event){
        event.stopPropagation();
        productQty += change;
        if(productQty<1){
                productQty=1;
        }
        document.getElementById("qtyValue").textContent=productQty;
}

export function getProductQty() {
    return productQty;
}

export function resetProductQty() {
    productQty = 1;
}

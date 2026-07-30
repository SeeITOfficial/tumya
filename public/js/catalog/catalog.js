import { Api } from "../api.js";
import { escapeHtml } from "../shared/utils.js";
import { addToCart, renderCartBar } from "./cart.js";

let catalogCache = [];
let productQty = 1;
let currentImages = [];

function safeImage(url) {
    return url ? encodeURI(url) : "";
}

export function getCatalogCache() {
    return catalogCache;
}

export async function renderHome(view) {
    const [catalog, mode] = await Promise.all([
        Api.getCatalog(),
        Api.getMarketMode(),
    ]);

    if (mode.market_mode) {
        catalog.forEach((item) => {
            if (item.stock_status === "out_of_stock") {
                item.stock_status = "coming_soon";
            }
        });
    }

    catalogCache = catalog;

    if (!catalogCache.length) {
        view.innerHTML = `
            <div class="empty-state">
                No items listed yet.
                <br><br>
                Check back soon, or use
                <strong>Send/Receive</strong>
                to request anything.
            </div>
        `;
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
        .forEach((button) => {
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                addToCart(Number(button.dataset.add));
            });
        });

    renderCartBar();
}

function itemCard(item) {

    let button;

    if (item.stock_status === "coming_soon") {

        button = `
            <button
                class="btn btn-sm btn-block"
                data-add="${item.id}"
                onclick="event.stopPropagation()"
            >
                Book
            </button>
        `;

    } else if (item.stock_status === "in_stock") {

        button = `
            <button
                class="btn btn-sm btn-block"
                data-add="${item.id}"
                onclick="event.stopPropagation()"
            >
                Add to Cart
            </button>
        `;

    } else {

        button = `
            <span class="badge badge-muted">
                Out of stock
            </span>
        `;
    }

    const statusClass =
        item.stock_status === "in_stock"
            ? "status-in-stock"
            : item.stock_status === "coming_soon"
                ? "status-coming-soon"
                : "status-out-of-stock";

    return `
        <div
            class="card product-card ${statusClass}"
            onclick="openProduct(${item.id})"
        >

            <div class="product-card-media ${item.photo_url ? "" : "product-card-media--empty"}">

                ${
                    item.photo_url
                        ? `
                            <img
                                src="${safeImage(item.photo_url)}"
                                class="product-card-image"
                                loading="lazy"
                                decoding="async"
                                alt="${escapeHtml(item.name)}"
                                onerror="this.src='/icons/image-placeholder.png'"
                            >
                        `
                        : `
                            <div class="product-card-placeholder">
                                <span class="product-card-placeholder-icon">
                                    🥑
                                </span>

                                <span class="product-card-placeholder-text">
                                    Photo coming soon
                                </span>
                            </div>
                        `
                }

            </div>

            <div class="product-card-title">
                ${escapeHtml(item.name)}
            </div>

            <div class="product-card-meta">
                ₹${item.price} / ${escapeHtml(item.unit)}
            </div>

            ${button}

        </div>
    `;
}

export function openProduct(id) {
    const item = catalogCache.find((i) => i.id === id);
    if (!item) return;

    resetProductQty();
    currentImages = [];

    if (item.photo_url) {
        currentImages.push(safeImage(item.photo_url));
    }
    if (item.photo_url_2) {
        currentImages.push(safeImage(item.photo_url_2));
    }

    document.body.style.overflow = "hidden";

    const overlay = document.createElement("div");
    overlay.className = "product-overlay";
    overlay.setAttribute("onclick", "closeProduct()");

    let imagesHtml = "";
    let dotsHtml = "";

    if (currentImages.length > 0) {
        imagesHtml = `
            <div class="product-gallery">
                ${currentImages
                    .map(
                        (src, index) => `
                        <img
                            src="${src}"
                            class="product-image"
                            loading="lazy"
                            alt="${escapeHtml(item.name)}"
                            onclick="openImageViewer(${index}, event)"
                            onerror="this.src='/icons/image-placeholder.png'"
                        >
                    `
                    )
                    .join("")}
            </div>
        `;

        if (currentImages.length > 1) {
            dotsHtml = `
                <div class="product-gallery-dots">
                    ${currentImages
                        .map(
                            (_, index) => `
                            <span class="product-gallery-dot ${
                                index === 0 ? "active" : ""
                            }"></span>
                        `
                        )
                        .join("")}
                </div>
            `;
        }
    }

    const displayDescription = item.description
        ? escapeHtml(item.description)
        : "Fresh quality product supplied by Tumya.";

    let buttonHtml = "";
    if (item.stock_status === "out_of_stock") {
        buttonHtml = `
            <button class="btn btn-block" disabled>
                Out of Stock
            </button>
        `;
    } else if (item.stock_status === "coming_soon") {
        buttonHtml = `
            <button
                class="btn btn-block"
                onclick="addToCart(${item.id})"
            >
                Book Now
            </button>
        `;
    } else {
        buttonHtml = `
            <button
                class="btn btn-block"
                onclick="addToCart(${item.id})"
            >
                Add to Cart
            </button>
        `;
    }

    const qtyHtml =
        item.stock_status === "out_of_stock"
            ? ""
            : `
                <div class="product-sheet-qty">
                    <button
                        class="btn btn-icon"
                        onclick="changeQty(-1, event)"
                    >
                        -
                    </button>
                    <span id="qtyValue">${productQty}</span>
                    <button
                        class="btn btn-icon"
                        onclick="changeQty(1, event)"
                    >
                        +
                    </button>
                </div>
            `;

    overlay.innerHTML = `
        <div class="product-sheet" onclick="event.stopPropagation()">
            <div
                class="product-close"
                onclick="closeProduct()"
                aria-label="Close"
            >
                ✕
            </div>

            ${imagesHtml}
            ${dotsHtml}

            <div class="product-sheet-content">
                <div class="product-sheet-title">
                    ${escapeHtml(item.name)}
                </div>

                <div class="product-sheet-meta">
                    ₹${item.price} / ${escapeHtml(item.unit)}
                </div>

                <div class="product-sheet-description">
                    ${displayDescription}
                </div>
            </div>

            <div class="product-sheet-controls">
                ${qtyHtml}
                ${buttonHtml}
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    if (currentImages.length > 1) {
        const gallery = overlay.querySelector(".product-gallery");
        const dots = overlay.querySelectorAll(".product-gallery-dot");
        if (gallery && dots.length > 0) {
            gallery.onscroll = () => {
                const index = Math.round(gallery.scrollLeft / gallery.clientWidth);
                dots.forEach((dot, i) => {
                    dot.classList.toggle("active", i === index);
                });
            };
        }
    }

    document.onkeydown = (event) => {
        if (event.key === "Escape") {
            closeProduct();
        }
    };
}

export function closeProduct() {
    const overlay = document.querySelector(".product-overlay");
    if (overlay) {
        overlay.remove();
    }
    document.body.style.overflow = "";
    document.onkeydown = null;
}

export function openImageViewer(index, event) {
    event.stopPropagation();

    document.body.style.overflow = "hidden";

    const overlay = document.createElement("div");

    overlay.className = "image-viewer";

    overlay.innerHTML = `
        <div
            class="viewer-close"
            onclick="closeImageViewer()"
            aria-label="Close"
        >
            ✕
        </div>

        <div class="viewer-count">
            ${index + 1} / ${currentImages.length}
        </div>

        <div class="viewer-gallery">

            ${currentImages
                .map(
                    (src) => `
                <img
                    src="${src}"
                    class="viewer-image"
                    loading="lazy"
                    onerror="this.src='/icons/image-placeholder.png'"
                >
            `
                )
                .join("")}

        </div>
    `;

    document.body.appendChild(overlay);

    const gallery = overlay.querySelector(".viewer-gallery");

    gallery.scrollLeft = gallery.clientWidth * index;

    document.onkeydown = (event) => {
        if (event.key === "Escape") {
            closeImageViewer();
        }
    };
}

export function closeImageViewer() {
    document.querySelector(".image-viewer")?.remove();

    // Restore scrolling only if the product sheet
    // is no longer open.
    if (!document.querySelector(".product-overlay")) {
        document.body.style.overflow = "";
    }

    document.onkeydown = (event) => {
        if (event.key === "Escape") {
            closeProduct();
        }
    };
}

export function changeQty(change, event) {
    event.stopPropagation();

    productQty += change;

    if (productQty < 1) {
        productQty = 1;
    }

    const qty = document.getElementById("qtyValue");

    if (qty) {
        qty.textContent = productQty;
    }
}

export function getProductQty() {
    return productQty;
}

export function resetProductQty() {
    productQty = 1;
}
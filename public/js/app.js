// --- App state ---
let cart = []; // [{item, qty}]
let catalogCache = [];
let pickupPointsCache = [];
let activeTab = "home";
let selectedProduct = null;
let productQty = 1;
let currentImages = [];

const app = document.getElementById("app");

function toast(msg, isError = false) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function money(n, currency = "") {
  return `${currency ? currency + " " : ""}${Number(n).toFixed(2)}`;
}

// --- Boot ---
async function boot() {
  if (!Api.token()) {
    renderLogin();
  } else {
    renderShell();
    await goto("home");
  }
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-screen">
      <div class="login-hero">
        <img src="/icons/icon-192.png" class="login-logo" />
        <h1 class="login-title">Tumya</h1>
        <p class="login-tagline">Send. Receive. Order.</p>
      </div>
      <div class="card login-card">
        <label>Your name</label>
        <input id="login-name" placeholder="e.g. Musa Kintu" />
        <label>Phone number</label>
        <input id="login-phone" placeholder="+256 7XX XXX XXX" inputmode="tel" />
        <button class="btn btn-block login-submit" id="login-btn">Continue</button>
        <p id="login-error" class="form-error login-error"></p>
      </div>
    </div>
  `;
  document.getElementById("login-btn").addEventListener("click", doLogin);
}

async function doLogin() {
  const name = document.getElementById("login-name").value.trim();
  const phone = document.getElementById("login-phone").value.trim();
  const errEl = document.getElementById("login-error");
  errEl.style.display = "none";

  if (!phone) {
    errEl.textContent = "Phone number is required.";
    errEl.style.display = "block";
    return;
  }

  try {
    const { token, user } = await Api.identify(phone, name || undefined);
    Api.setToken(token);
    Api.setUser(user);
    renderShell();
    await goto("home");
    setupPush();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = "block";
  }
}

function renderShell() {
  app.innerHTML = `
    <div class="topbar">
      <div class="topbar-brand">
        <img src="/icons/icon-192.png" class="topbar-logo" />
        <h1>Tumya</h1>
      </div>
    </div>
    <div id="view" class="container"></div>
    <div class="tabbar">
      <button data-tab="home">Shop</button>
      <button data-tab="parcel">Send/Receive</button>
      <button data-tab="track">My Parcels</button>
      <button data-tab="account">Account</button>
    </div>
  `;
  document
    .querySelectorAll(".tabbar button")
    .forEach((b) => b.addEventListener("click", () => goto(b.dataset.tab)));
}

async function goto(tab) {
  activeTab = tab;
  document
    .querySelectorAll(".tabbar button")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  const view = document.getElementById("view");
  view.innerHTML = `<div class="empty-state">Loading...</div>`;

  try {
    if (tab === "home") await renderHome(view);
    else if (tab === "parcel") renderParcelForm(view);
    else if (tab === "track") renderTrack(view);
    else if (tab === "account") await renderAccount(view);
  } catch (err) {
    view.innerHTML = `<div class="empty-state">Couldn't load this page.<br>${err.message}</div>`;
  }
}

// --- Home: catalog + cart ---
async function renderHome(view) {
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

  let button;

  if (item.stock_status === "coming_soon") {
    button = `<button class="btn btn-sm btn-block" data-add="${item.id} onclick="event.stopPropagation()">Book</button>`;
  } else if (item.stock_status === "in_stock") {
    button = `<button class="btn btn-sm btn-block" data-add="${item.id} onclick="event.stopPropagation()">Add</button>`;
  } else {
    button = `<span class="badge badge-muted">Out of stock</span>`;
  }

  return `
    <div class="card product-card" onclick="openProduct(${item.id})">
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


function openProduct(id) {

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

    <div class="product-sheet"
         onclick="event.stopPropagation()">

        <button
            class="product-close"
            onclick="closeProduct()">

            ✕

        </button>

        <div
            class="product-gallery"
            id="productGallery">

            ${images.map((src, i)=>`

                <img
                    src="${src}"
                    class="product-image"
                    onclick="openImageViewer('${i}', event)">

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

            <h2>

                ${escapeHtml(item.name)}

            </h2>

            <div class="product-price">

                ₹${item.price}

            </div>

            <div class="product-unit">

                per ${escapeHtml(item.unit)}

            </div>

            <p class="product-description">

                Fresh quality product supplied by Tumya.

            </p>

            <div class="qty-section">

                <span>Quantity</span>

                <div class="qty-controls">

                    <button
                        class="qty-btn"
                        onclick="changeQty(-1,event)">

                        −

                    </button>

                    <span
                        id="qtyValue">

                        1

                    </span>

                    <button
                        class="qty-btn"
                        onclick="changeQty(1,event)">

                        +

                    </button>

                </div>

            </div>

        </div>

        <div class="product-actions">

            <button
                class="btn btn-block"
                onclick="addToCart(${item.id})">

                ${
                    item.stock_status==="coming_soon"
                    ? "Book Now"
                    : "Add to Cart"
                }

            </button>

        </div>

    </div>

</div>

`);

    const gallery = document.getElementById("productGallery");

    if(gallery){

        gallery.addEventListener("scroll",()=>{

            const index=Math.round(
                gallery.scrollLeft/gallery.clientWidth
            );

            document
            .querySelectorAll(".product-dot")
            .forEach((dot,i)=>{

                dot.classList.toggle(
                    "active",
                    i===index
                );

            });

        });

    }

}

function closeProduct() {
    document.querySelector(".product-overlay")?.remove();
}

function openImageViewer(index, event) {

    event.stopPropagation();

    const overlay = document.createElement("div");

    overlay.className = "image-viewer";

    overlay.innerHTML = `

<div class="viewer-close"
     onclick="closeImageViewer()">

✕

</div>

<div class="viewer-count">

${index + 1} / ${currentImages.length}

</div>

<div class="viewer-gallery">

${currentImages.map(src => `

<img
src="${src}"
class="viewer-image">

`).join("")}

</div>

`;

    document.body.appendChild(overlay);

    const gallery = overlay.querySelector(".viewer-gallery");

    gallery.scrollLeft = gallery.clientWidth * index;

}

function closeImageViewer(){

    document.querySelector(".image-viewer")?.remove();

}

function changeQty(change,event){

    event.stopPropagation();

    productQty += change;

    if(productQty<1){

        productQty=1;

    }

    document.getElementById("qtyValue").textContent=productQty;

}


function addToCart(itemId) {

  const item = catalogCache.find((i) => i.id === itemId);

  const existing = cart.find((c) => c.item.id === itemId);

  if (existing) {

    existing.qty += productQty;

  } else {

    cart.push({
      item,
      qty: productQty,
    });

  }

  renderCartBar();

  toast(`Added ${productQty} × ${item.name}`);

  closeProduct();

}

function renderCartBar() {
  const bar = document.getElementById("cart-bar");
  if (!bar) return;
  if (cart.length === 0) {
    bar.innerHTML = "";
    return;
  }

  const total = cart.reduce((s, c) => s + c.item.price * c.qty, 0);
  bar.innerHTML = `
    <div class="card cart-bar">
      <div class="cart-summary">
        <div class="cart-summary-count">${cart.reduce((s, c) => s + c.qty, 0)} item(s)</div>
        <div class="cart-summary-total">₹${total.toFixed(2)}</div>
      </div>
      <button class="btn" id="checkout-btn">Checkout</button>
    </div>
  `;
  document
    .getElementById("checkout-btn")
    .addEventListener("click", renderCheckout);
}

function renderCheckout() {
  const view = document.getElementById("view");
  const total = cart.reduce((s, c) => s + c.item.price * c.qty, 0);
  view.innerHTML = `
    <h2 class="page-title">Checkout</h2>
    <div class="card checkout-summary">
      ${cart
        .map(
          (c) => `
        <div class="checkout-row">
          <span class="checkout-item-name">${escapeHtml(c.item.name)} × ${c.qty}</span>
          <span class="checkout-item-price">₹${(c.item.price * c.qty).toFixed(2)}</span>
        </div>
      `,
        )
        .join("")}
      <div class="checkout-total-row">
        <span>Total</span><span>₹${total.toFixed(2)}</span>
      </div>
    </div>

    <label>Payment method</label>
    <div class="payment-options">
      <label class="card payment-option">
        <input type="radio" name="pm" value="cod_cash" checked /> Cash on delivery
      </label>
      <label class="card payment-option">
        <input type="radio" name="pm" value="cod_upi_scan" /> Scan &amp; pay (GPay/UPI) at handoff
      </label>
    </div>

    <button class="btn btn-block form-action-primary" id="place-order-btn">Place order</button>
    <button class="btn btn-outline btn-block form-action-secondary" id="cancel-checkout-btn">Back</button>
  `;
  document
    .getElementById("cancel-checkout-btn")
    .addEventListener("click", () => goto("home"));
  document
    .getElementById("place-order-btn")
    .addEventListener("click", placeCatalogOrder);
}

async function placeCatalogOrder() {
  const payment_mode = document.querySelector('input[name="pm"]:checked').value;
  const items = cart.map((c) => ({ catalog_item_id: c.item.id, qty: c.qty }));
  try {
    const order = await Api.placeCatalogOrder(items, payment_mode);
    cart = [];
    const view = document.getElementById("view");
    view.innerHTML = orderPlacedHtml(order);
    document
      .getElementById("back-home-btn")
      .addEventListener("click", () => goto("home"));
  } catch (err) {
    toast(err.message, true);
  }
}

function orderPlacedHtml(order) {
  return `
    <div class="card success-card">
      <div class="success-icon">📦</div>
      <h2 class="success-title">Order placed</h2>
      <p class="success-copy">Your tracking code:</p>
      <div class="badge success-badge">${order.tracking_code}</div>
      <p class="success-note">
        ${
          order.payment_mode === "cod_upi_scan"
            ? "We'll show you a QR code to scan when your order arrives."
            : "Pay cash when your order arrives."
        }
      </p>
      <button class="btn btn-block success-action" id="back-home-btn">Back to shop</button>
    </div>
  `;
}

// --- Parcel form ---
async function renderParcelForm(view) {
  pickupPointsCache = await Api.getPickupPoints();

  window.parcelWizard = {
    step: 1,
    data: {}
  };

  renderParcelStep(view);
}

function renderParcelStep(view) {
  switch (parcelWizard.step) {

    case 1:
      view.innerHTML = `
        <div class="wizard">

          <div class="wizard-progress">
            Step 1 of 6
          </div>

          <h2 class="wizard-title">
            What would you like to do?
          </h2>

          <div class="wizard-options">

            <button class="wizard-card" id="send-btn">
              <div class="wizard-icon">📤</div>
              <div class="wizard-heading">Send Parcel</div>
              <div class="wizard-text">
                Send something to another country.
              </div>
            </button>

            <button class="wizard-card" id="receive-btn">
              <div class="wizard-icon">📥</div>
              <div class="wizard-heading">Receive Parcel</div>
              <div class="wizard-text">
                Receive something from another country.
              </div>
            </button>

          </div>

        </div>
      `;

      document.getElementById("send-btn").onclick = () => {
        parcelWizard.data.mode = "send";
        parcelWizard.step = 2;
        renderParcelStep(view);
      };

      document.getElementById("receive-btn").onclick = () => {
        parcelWizard.data.mode = "receive";
        parcelWizard.step = 2;
        renderParcelStep(view);
      };

      break;

    case 2:

      view.innerHTML = `
        <div class="wizard">

          <div class="wizard-progress">
            Step 2 of 6
          </div>

          <h2 class="wizard-title">
            Where is it travelling?
          </h2>

          <div class="wizard-options">

            <button class="wizard-card" id="ug-india">
              🇺🇬
              <br><br>
              Uganda
              →
              India
            </button>

            <button class="wizard-card" id="india-ug">
              🇮🇳
              <br><br>
              India
              →
              Uganda
            </button>

          </div>

        </div>
      `;

      document.getElementById("ug-india").onclick = () => {
          parcelWizard.data.direction = "uganda_to_india";
          parcelWizard.step = 3;
          renderParcelStep(view);
      };

      document.getElementById("india-ug").onclick = () => {
          parcelWizard.data.direction = "india_to_uganda";
          parcelWizard.step = 3;
          renderParcelStep(view);
      };
      break;

    case 3:

      view.innerHTML = `
      <div class="wizard">

      <div class="wizard-progress">
      Step 3 of 6
      </div>

      <h2 class="wizard-title">
      What are you sending?
      </h2>

      <div class="category-grid">

      <button class="category-card" data-category="food">
      🍌
      <span>Food</span>
      </button>

      <button class="category-card" data-category="clothes">
      👕
      <span>Clothes</span>
      </button>

      <button class="category-card" data-category="medicine">
      💊
      <span>Medicine</span>
      </button>

      <button class="category-card" data-category="electronics">
      💻
      <span>Electronics</span>
      </button>

      <button class="category-card" data-category="documents">
      📄
      <span>Documents</span>
      </button>

      <button class="category-card" data-category="other">
      📦
      <span>Other</span>
      </button>

      </div>

      <div id="other-box"></div>

      </div>
      `;

      document.querySelectorAll(".category-card").forEach(card=>{

      card.onclick=()=>{

      parcelWizard.data.category=card.dataset.category;

      if(card.dataset.category==="other"){

      document.getElementById("other-box").innerHTML=`

      <label style="margin-top:24px;">
      Describe your parcel
      </label>

      <textarea
      id="other-description"
      rows="4"
      placeholder="Describe what you are sending..."></textarea>

      <button
      class="btn btn-block"
      style="margin-top:18px;"
      id="continue-other">

      Continue

      </button>

      `;

      document.getElementById("continue-other").onclick=()=>{

      parcelWizard.data.otherDescription=
      document.getElementById("other-description").value;

      parcelWizard.step=4;

      renderParcelStep(view);

      };

      return;

      }

      parcelWizard.step=4;

      renderParcelStep(view);

      };

      });

    break;

    case 4:

    view.innerHTML = `

    <div class="wizard">

    <div class="wizard-progress">

    Step 4 of 6

    </div>

    <h2 class="wizard-title">

    How should we collect it?

    </h2>

    <div class="wizard-options">

    <button
    class="wizard-card"
    id="tumya-delivery">

    <div class="wizard-icon">

    🚚

    </div>

    <div class="wizard-heading">

    Tumya Delivery

    </div>

    <div class="wizard-text">

    We'll collect it from you.

    </div>

    </button>

    <button
    class="wizard-card"
    id="my-boda">

    <div class="wizard-icon">

    🛵

    </div>

    <div class="wizard-heading">

    My Boda

    </div>

    <div class="wizard-text">

    My rider will collect it.

    </div>

    </button>

    <button
    class="wizard-card"
    id="self-drop">

    <div class="wizard-icon">

    📍

    </div>

    <div class="wizard-heading">

    Self Drop-off

    </div>

    <div class="wizard-text">

    I'll bring it myself.

    </div>

    </button>

    </div>

    </div>

    `;

    document.getElementById("tumya-delivery").onclick=()=>{

    parcelWizard.data.pickup="tumya";

    parcelWizard.step=5;

    renderParcelStep(view);

    };

    document.getElementById("my-boda").onclick=()=>{

    parcelWizard.data.pickup="boda";

    parcelWizard.step=5;

    renderParcelStep(view);

    };

    document.getElementById("self-drop").onclick=()=>{

    parcelWizard.data.pickup="self";

    parcelWizard.step=5;

    renderParcelStep(view);

    };

    break;


    case 5:

    if(parcelWizard.data.pickup==="tumya"){

    view.innerHTML=`

    <div class="wizard">

    <div class="wizard-progress">

    Step 5 of 6

    </div>

    <h2 class="wizard-title">

    Where should we collect it?

    </h2>

    <div class="wizard-options">

    <button class="wizard-card" id="current-location">

    📍

    <br><br>

    Use Current Location

    </button>

    <button class="wizard-card" id="search-location">

    🔎

    <br><br>

    Search Location

    </button>

    <button class="wizard-card" id="manual-location">

    ✍

    <br><br>

    Enter Manually

    </button>

    </div>

    <div id="location-extra"></div>

    </div>

    `;

    document.getElementById("current-location").onclick=()=>{

    if(!navigator.geolocation){

    toast("Geolocation isn't supported.",true);

    return;

    }

    navigator.geolocation.getCurrentPosition(pos=>{

    parcelWizard.data.pickup_address=

    `${pos.coords.latitude}, ${pos.coords.longitude}`;

    parcelWizard.step=6;

    renderParcelStep(view);

    },()=>{

    toast("Couldn't get your location.",true);

    });

    };

    document.getElementById("search-location").onclick=()=>{

    document.getElementById("location-extra").innerHTML=`

    <label>Search</label>

    <input
    id="search-box"
    placeholder="Coming in next step...">

    <button
    class="btn btn-block"
    id="continue-search">

    Continue

    </button>

    `;

    document.getElementById("continue-search").onclick=()=>{

    parcelWizard.data.pickup_address=

    document.getElementById("search-box").value;

    parcelWizard.step=6;

    renderParcelStep(view);

    };

    };

    document.getElementById("manual-location").onclick=()=>{

    document.getElementById("location-extra").innerHTML=`

    <label>Address</label>

    <textarea
    id="manual-address"
    rows="4"
    placeholder="Enter full address"></textarea>

    <button
    class="btn btn-block"
    id="continue-manual">

    Continue

    </button>

    `;

    document.getElementById("continue-manual").onclick=()=>{

    parcelWizard.data.pickup_address=

    document.getElementById("manual-address").value;

    parcelWizard.step=6;

    renderParcelStep(view);

    };

    };

    break;

    }

    if(parcelWizard.data.pickup==="boda"){

    view.innerHTML=`

    <div class="wizard">

    <div class="wizard-progress">

    Step 5 of 6

    </div>

    <h2 class="wizard-title">

    Tell us about your rider

    </h2>

    <label>Driver Name</label>

    <input id="boda-name">

    <label>Phone Number</label>

    <input id="boda-phone">

    <label>Notes (optional)</label>

    <textarea id="boda-notes"></textarea>

    <button
    class="btn btn-block"
    id="continue-boda">

    Continue

    </button>

    </div>

    `;

    document.getElementById("continue-boda").onclick=()=>{

    parcelWizard.data.boda_name=

    document.getElementById("boda-name").value;

    parcelWizard.data.boda_phone=

    document.getElementById("boda-phone").value;

    parcelWizard.data.boda_notes=

    document.getElementById("boda-notes").value;

    parcelWizard.step=6;

    renderParcelStep(view);

    };

    break;

    }


    case 6:

    let pickupInfo = "";

    if (parcelWizard.data.pickup === "tumya") {
      pickupInfo = `
        <div class="review-row">
          <strong>Pickup</strong>
          <span>🚚 Tumya Delivery</span>
        </div>

        <div class="review-row">
          <strong>Location</strong>
          <span>${parcelWizard.data.pickup_address || "-"}</span>
        </div>
      `;
    }

    if (parcelWizard.data.pickup === "boda") {
      pickupInfo = `
        <div class="review-row">
          <strong>Pickup</strong>
          <span>🛵 My Boda</span>
        </div>

        <div class="review-row">
          <strong>Driver</strong>
          <span>${parcelWizard.data.boda_name}</span>
        </div>

        <div class="review-row">
          <strong>Phone</strong>
          <span>${parcelWizard.data.boda_phone}</span>
        </div>
      `;
    }

    if (parcelWizard.data.pickup === "self") {
      pickupInfo = `
        <div class="review-row">
          <strong>Pickup</strong>
          <span>📍 Self Drop-off</span>
        </div>
      `;
    }

    view.innerHTML = `
    <div class="wizard">

    <div class="wizard-progress">
    Step 6 of 6
    </div>

    <h2 class="wizard-title">
    Review Parcel
    </h2>

    <div class="review-card">

    <div class="review-row">
    <strong>Action</strong>
    <span>${parcelWizard.data.mode}</span>
    </div>

    <div class="review-row">
    <strong>Direction</strong>
    <span>${parcelWizard.data.direction}</span>
    </div>

    <div class="review-row">
    <strong>Category</strong>
    <span>${parcelWizard.data.category}</span>
    </div>

    ${pickupInfo}

    </div>

    <div style="display:flex;gap:12px;margin-top:24px;">

    <button
    class="btn btn-secondary"
    style="flex:1"
    onclick="
    parcelWizard.step=5;
    renderParcelStep(document.getElementById('view'));
    ">
    Back
    </button>

    <button
    class="btn btn-block"
    style="flex:2"
    id="submitParcelBtn">
    Submit Parcel
    </button>

    </div>

    </div>
    `;

    document
    .getElementById("submitParcelBtn")
    .onclick = async () => {

    try{

    const payload = {

      send_or_receive: parcelWizard.data.mode,

      direction: parcelWizard.data.direction,

      description: parcelWizard.data.category,

      photo_url: null,

      pickup_handler_type:
        parcelWizard.data.pickup === "tumya"
          ? "you_deliver"
          : parcelWizard.data.pickup === "boda"
          ? "own_agent"
          : "self_pickup",

      pickup_point_id:
        parcelWizard.data.pickup === "self"
          ? 1
          : null,

      pickup_agent_name:
        parcelWizard.data.boda_name || null,

      pickup_agent_phone:
        parcelWizard.data.boda_phone || null,

      pickup_address:
        parcelWizard.data.pickup_address || null,

      // REQUIRED BY BACKEND

      drop_handler_type: "self_pickup",

      drop_point_id: 1,

      drop_agent_name: null,

      drop_agent_phone: null,

      drop_address: null

    };
    
    const result =
    await Api.submitParcel(payload);

    view.innerHTML = `
    <div class="wizard success-screen">

    <div style="font-size:70px;">✅</div>

    <h2>Parcel Submitted</h2>

    <p>Your parcel has been received.</p>

    <div class="review-card">

    <div class="review-row">
    <strong>Tracking Code</strong>
    <span>${result.order.tracking_code}</span>
    </div>

    </div>

    <button
    class="btn btn-block"
    id="trackNowBtn">

    Track Parcel

    </button>

    </div>
    `;

    document.getElementById("trackNowBtn").onclick = () => {
      goto("track");
    };

    }catch(err){

    toast(err.message,true);

    }

    };
    break;

  }
}


function handlerFields(prefix) {
  const pointOptions = pickupPointsCache
    .map(
      (p) =>
        `<option value="${p.id}">${escapeHtml(p.name)} — ${escapeHtml(p.area)}</option>`,
    )
    .join("");
  return `
    <label>How will it be ${prefix === "pickup" ? "collected" : "delivered"}?</label>
    <select id="${prefix}-handler">
      <option value="you_deliver">Tumya team handles it</option>
      <option value="self_pickup">Fixed pickup point</option>
      <option value="own_agent">My own person (agent)</option>
    </select>
    <div id="${prefix}-extra">
      <label>Address</label>
      <input id="${prefix}-address" placeholder="Full address" />
    </div>
  `;
}

function toggleHandlerFields(prefix, type) {
  const extra = document.getElementById(`${prefix}-extra`);
  if (type === "self_pickup") {
    const pointOptions = pickupPointsCache
      .map(
        (p) =>
          `<option value="${p.id}">${escapeHtml(p.name)} — ${escapeHtml(p.area)}</option>`,
      )
      .join("");
    extra.innerHTML = `<label>Pickup point</label><select id="${prefix}-point">${pointOptions}</select>`;
  } else if (type === "own_agent") {
    extra.innerHTML = `
      <label>Agent name</label><input id="${prefix}-agent-name" placeholder="Full name" />
      <label>Agent phone</label><input id="${prefix}-agent-phone" placeholder="+256 7XX XXX XXX" />
    `;
  } else {
    extra.innerHTML = `<label>Address</label><input id="${prefix}-address" placeholder="Full address" />`;
  }
}

async function submitParcel() {
  const errEl = document.getElementById("parcel-error");
  errEl.style.display = "none";

  const payload = {
    send_or_receive: document.getElementById("p-sr").value,
    direction: document.getElementById("p-direction").value,
    description: document.getElementById("p-desc").value.trim(),
  };
  if (!payload.description) {
    errEl.textContent = "Please describe the item.";
    errEl.style.display = "block";
    return;
  }

  for (const prefix of ["pickup", "drop"]) {
    const type = document.getElementById(`${prefix}-handler`).value;
    payload[`${prefix}_handler_type`] = type;
    if (type === "self_pickup")
      payload[`${prefix}_point_id`] = Number(
        document.getElementById(`${prefix}-point`).value,
      );
    else if (type === "own_agent") {
      payload[`${prefix}_agent_name`] = document
        .getElementById(`${prefix}-agent-name`)
        .value.trim();
      payload[`${prefix}_agent_phone`] = document
        .getElementById(`${prefix}-agent-phone`)
        .value.trim();
    } else {
      payload[`${prefix}_address`] = document
        .getElementById(`${prefix}-address`)
        .value.trim();
    }
  }

  try {
    const { order } = await Api.submitParcel(payload);
    const view = document.getElementById("view");
    view.innerHTML = `
      <div class="card success-card">
        <div class="success-icon">📮</div>
        <h2 class="success-title">Parcel submitted</h2>
        <p class="success-copy">Your tracking code:</p>
        <div class="badge success-badge">${order.tracking_code}</div>
        <p class="success-note">Our team will weigh it and send you a quote shortly.</p>
        <button class="btn btn-block success-action" id="back-home-btn2">Back to shop</button>
      </div>
    `;
    document
      .getElementById("back-home-btn2")
      .addEventListener("click", () => goto("home"));
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = "block";
  }
}

// --- Track ---
async function renderTrack(view) {

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

async function doTrack(code = null) {

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
// --- Account ---
async function renderAccount(view) {
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

// --- Push setup (best-effort, silently no-ops if unsupported/unconfigured) ---
async function setupPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const { key } = await Api.vapidKey();
    const existing = await reg.pushManager.getSubscription();
    if (existing) return;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    await Api.pushSubscribe(sub.toJSON());
  } catch (err) {
    // Push is a nice-to-have, not a dependency — fail silently
    console.warn("Push setup skipped:", err.message);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

const isDev =
    location.hostname === "localhost" ||
    location.hostname.startsWith("127.");

if (!isDev) {
    navigator.serviceWorker.register("/sw.js");
}

boot();
if (Api.token()) setupPush();

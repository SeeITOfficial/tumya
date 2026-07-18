import { Api } from "../api.js";
import { escapeHtml } from "../shared/utils.js";
import { toast } from "../shared/ui.js";
import { goto } from "../app.js";

let pickupPointsCache = [];

export const parcelWizard = {
  step: 1,
  data: {},
};

export function getPickupPointsCache() {
  return pickupPointsCache;
}

// --- Parcel form ---
export async function renderParcelForm(view) {
  pickupPointsCache = await Api.getPickupPoints();

  parcelWizard.step = 1;
  parcelWizard.data = {};

  renderParcelStep(view);
}

export function renderParcelStep(view) {
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

    if (parcelWizard.data.pickup === "tumya") {

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

    if (parcelWizard.data.pickup === "boda") {

    const existingName = parcelWizard.data.boda_name || "";
    const existingPhone = parcelWizard.data.boda_phone || "";
    const existingNotes = parcelWizard.data.boda_notes || "";

    view.innerHTML=`

    <div class="wizard">

    <div class="wizard-progress">

    Step 5 of 6

    </div>

    <h2 class="wizard-title">

    Tell us about your rider

    </h2>

    <label>Driver Name</label>

    <input id="boda-name" value="${escapeHtml(existingName)}">

    <label>Phone Number</label>

    <input id="boda-phone" value="${escapeHtml(existingPhone)}">

    <label>Notes (optional)</label>

    <textarea id="boda-notes">${escapeHtml(existingNotes)}</textarea>

    <button
    class="btn btn-block"
    id="continue-boda">

    Continue

    </button>

    </div>

    `;

    document.getElementById("continue-boda").onclick=()=>{

    const bodaName = document.getElementById("boda-name").value.trim();
    const bodaPhone = document.getElementById("boda-phone").value.trim();
    const bodaNotes = document.getElementById("boda-notes").value.trim();

    if (!bodaName || !bodaPhone) {
      toast("Driver name and phone are required.", true);
      return;
    }

    parcelWizard.data.boda_name = bodaName;
    parcelWizard.data.boda_phone = bodaPhone;
    parcelWizard.data.boda_notes = bodaNotes;

    parcelWizard.step=6;

    renderParcelStep(view);

    };

    break;

    }

    // Self drop-off has no extra step-5 fields — go straight to review
    if (parcelWizard.data.pickup === "self") {
      parcelWizard.step = 6;
      renderParcelStep(view);
      break;
    }

    break;

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
          <span>${escapeHtml(parcelWizard.data.boda_name || "-")}</span>
        </div>

        <div class="review-row">
          <strong>Phone</strong>
          <span>${escapeHtml(parcelWizard.data.boda_phone || "-")}</span>
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
    id="backParcelBtn">
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

    document.getElementById("backParcelBtn").onclick = () => {
      // Self skip has no step-5 form; go back to pickup method
      parcelWizard.step = parcelWizard.data.pickup === "self" ? 4 : 5;
      renderParcelStep(view);
    };

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
      goto("orders");
    };

    }catch(err){

    toast(err.message,true);

    }

    };
    break;

  }
}

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

const TOTAL_STEPS = 8;

// --- Parcel form ---
export async function renderParcelForm(view) {
  pickupPointsCache = await Api.getPickupPoints();

  parcelWizard.step = 1;
  parcelWizard.data = {};

  renderParcelStep(view);
}

function progressLabel(step) {
  return `Step ${step} of ${TOTAL_STEPS}`;
}

// Small shared "back" link, added consistently from step 2 onward.
// Every path is now a strict 1-8 sequence (no more skip-cases), so a plain
// decrement is always correct — no special-casing needed like the original
// review-step back button had to do for the old "self skips step 5" gap.
function backLinkHtml() {
  return `<button class="wizard-back" id="wizard-back-btn" type="button">&larr;</button>`;
}

function wireBackLink(view) {
  const btn = document.getElementById("wizard-back-btn");
  if (btn) {
    btn.onclick = () => {
      parcelWizard.step -= 1;
      renderParcelStep(view);
    };
  }
}

function pickupPointOptionsHtml() {
  return pickupPointsCache
    .map(
      (p) =>
        `<option value="${p.id}">${escapeHtml(p.name)} — ${escapeHtml(p.area)}</option>`,
    )
    .join("");
}

// Renders the location-capture sub-step used whenever "Tumya" collects/delivers
// at the ORIGIN side. Shared by both directions since the real-world need
// (agent needs a pickup location) is identical regardless of direction.
function renderCollectLocationStep(view, title) {
  view.innerHTML = `
    <div class="wizard">
      ${backLinkHtml()}
      <div class="wizard-progress">${progressLabel(parcelWizard.step)}</div>
      <h2 class="wizard-title">${title}</h2>

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

  wireBackLink(view);

  document.getElementById("current-location").onclick = () => {
    if (!navigator.geolocation) {
      toast("Geolocation isn't supported on this device.", true);
      return;
    }

    // Geolocation silently refuses on plain HTTP (except localhost) — this is
    // the most common real cause of "Couldn't get your location" and, unlike
    // a permission denial, the browser gives no other signal for it, so we
    // check for it explicitly and tell the user the real reason.
    if (!window.isSecureContext) {
      toast(
        "Location access needs a secure (https) connection. Please enter the address manually instead.",
        true,
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        if (accuracy > 5000) {
          // City-level accuracy — likely IP-based, not GPS. Warn the user.
          toast(
            `⚠️ Location is only accurate to ~${Math.round(accuracy / 1000)}km. This may be your city, not your exact location. Please use "Enter Manually" for a precise address.`,
            true,
          );
          // Save coords anyway so admin sees a rough area
          parcelWizard.data.pickup_address = `${latitude}, ${longitude}`;
          parcelWizard.step += 1;
          renderParcelStep(view);
        } else {
          parcelWizard.data.pickup_address = `${latitude}, ${longitude}`;
          parcelWizard.step += 1;
          renderParcelStep(view);
        }
      },
      (err) => {
        let msg = "Couldn't get your location. Please enter it manually instead.";
        if (err.code === err.PERMISSION_DENIED) {
          msg = "Location access was denied. Please allow location access in your browser settings, or enter the address manually.";
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = "Your location couldn't be determined right now. Please enter the address manually.";
        } else if (err.code === err.TIMEOUT) {
          msg = "Location request timed out. Please try again or enter the address manually.";
        }
        toast(msg, true);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  document.getElementById("search-location").onclick = () => {
    document.getElementById("location-extra").innerHTML = `
      <label>Search</label>
      <input id="search-box" placeholder="Coming in next step...">
      <button class="btn btn-block" id="continue-search">Continue</button>
    `;

    document.getElementById("continue-search").onclick = () => {
      parcelWizard.data.pickup_address = document.getElementById("search-box").value;
      parcelWizard.step += 1;
      renderParcelStep(view);
    };
  };

  document.getElementById("manual-location").onclick = () => {
    document.getElementById("location-extra").innerHTML = `
      <label>Address</label>
      <textarea id="manual-address" rows="4" placeholder="Enter full address"></textarea>
      <button class="btn btn-block" id="continue-manual">Continue</button>
    `;

    document.getElementById("continue-manual").onclick = () => {
      parcelWizard.data.pickup_address = document.getElementById("manual-address").value;
      parcelWizard.step += 1;
      renderParcelStep(view);
    };
  };
}

// Boda (own-rider) contact-detail sub-step. Shared by origin and destination
// sides — which fields it writes to is controlled by `keys`.
function renderBodaStep(view, title, keys) {
  const existingName = parcelWizard.data[keys.name] || "";
  const existingPhone = parcelWizard.data[keys.phone] || "";
  const existingNotes = parcelWizard.data[keys.notes] || "";

  view.innerHTML = `
    <div class="wizard">
      ${backLinkHtml()}
      <div class="wizard-progress">${progressLabel(parcelWizard.step)}</div>
      <h2 class="wizard-title">${title}</h2>

      <label>Driver Name</label>
      <input id="boda-name" value="${escapeHtml(existingName)}">

      <label>Phone Number</label>
      <input id="boda-phone" value="${escapeHtml(existingPhone)}">

      <label>Notes (optional)</label>
      <textarea id="boda-notes">${escapeHtml(existingNotes)}</textarea>

      <button class="btn btn-block" id="continue-boda">Continue</button>
    </div>
  `;

  wireBackLink(view);

  document.getElementById("continue-boda").onclick = () => {
    const bodaName = document.getElementById("boda-name").value.trim();
    const bodaPhone = document.getElementById("boda-phone").value.trim();
    const bodaNotes = document.getElementById("boda-notes").value.trim();

    if (!bodaName || !bodaPhone) {
      toast("Driver name and phone are required.", true);
      return;
    }

    parcelWizard.data[keys.name] = bodaName;
    parcelWizard.data[keys.phone] = bodaPhone;
    parcelWizard.data[keys.notes] = bodaNotes;

    parcelWizard.step += 1;
    renderParcelStep(view);
  };
}

// Fixed pickup-point selection sub-step — used for "Self Drop-off" on either
// side. Previously this option never captured a location at all; now it
// reuses the same admin-configured pickup points shown elsewhere in the app.
function renderPointSelectStep(view, title, dataKey) {
  view.innerHTML = `
    <div class="wizard">
      ${backLinkHtml()}
      <div class="wizard-progress">${progressLabel(parcelWizard.step)}</div>
      <h2 class="wizard-title">${title}</h2>

      <label>Pickup point</label>
      <select id="point-select">${pickupPointOptionsHtml()}</select>

      <button class="btn btn-block" id="continue-point" style="margin-top:18px;">Continue</button>
    </div>
  `;

  wireBackLink(view);

  document.getElementById("continue-point").onclick = () => {
    const select = document.getElementById("point-select");
    if (!select.value) {
      toast("Please choose a pickup point.", true);
      return;
    }
    parcelWizard.data[dataKey] = Number(select.value);
    parcelWizard.step += 1;
    renderParcelStep(view);
  };
}

// Plain manual address entry — used for the India-side destination
// (Uganda -> India), where there's no "current location" to fetch since
// the sender isn't physically at the recipient's address.
function renderAddressStep(view, title, dataKey) {
  const existing = parcelWizard.data[dataKey] || "";

  view.innerHTML = `
    <div class="wizard">
      ${backLinkHtml()}
      <div class="wizard-progress">${progressLabel(parcelWizard.step)}</div>
      <h2 class="wizard-title">${title}</h2>

      <label>Address</label>
      <textarea id="dest-address" rows="4" placeholder="Enter full address">${escapeHtml(existing)}</textarea>

      <button class="btn btn-block" id="continue-address" style="margin-top:18px;">Continue</button>
    </div>
  `;

  wireBackLink(view);

  document.getElementById("continue-address").onclick = () => {
    const value = document.getElementById("dest-address").value.trim();
    if (!value) {
      toast("Please enter an address.", true);
      return;
    }
    parcelWizard.data[dataKey] = value;
    parcelWizard.step += 1;
    renderParcelStep(view);
  };
}

// Contact-person name/phone — used for the India-side destination step,
// right after the address (Uganda -> India only, per spec).
function renderContactStep(view, title) {
  const existingName = parcelWizard.data.drop_contact_name || "";
  const existingPhone = parcelWizard.data.drop_contact_phone || "";

  view.innerHTML = `
    <div class="wizard">
      ${backLinkHtml()}
      <div class="wizard-progress">${progressLabel(parcelWizard.step)}</div>
      <h2 class="wizard-title">${title}</h2>

      <label>Contact Name</label>
      <input id="contact-name" value="${escapeHtml(existingName)}">

      <label>Contact Number</label>
      <input id="contact-phone" value="${escapeHtml(existingPhone)}">

      <button class="btn btn-block" id="continue-contact" style="margin-top:18px;">Continue</button>
    </div>
  `;

  wireBackLink(view);

  document.getElementById("continue-contact").onclick = () => {
    const name = document.getElementById("contact-name").value.trim();
    const phone = document.getElementById("contact-phone").value.trim();

    if (!name || !phone) {
      toast("Contact name and phone are required.", true);
      return;
    }

    parcelWizard.data.drop_contact_name = name;
    parcelWizard.data.drop_contact_phone = phone;
    parcelWizard.step += 1;
    renderParcelStep(view);
  };
}

export function renderParcelStep(view) {
  const { mode, direction } = parcelWizard.data;
  const isReceive = mode === "receive";

  switch (parcelWizard.step) {

    case 1:
      view.innerHTML = `
        <div class="wizard">
          <div class="wizard-progress">${progressLabel(1)}</div>
          <h2 class="wizard-title">What would you like to do?</h2>

          <div class="wizard-options">
            <button class="wizard-card" id="send-btn">
              <div class="wizard-icon">📤</div>
              <div class="wizard-heading">Send Parcel</div>
              <div class="wizard-text">Send something to another country.</div>
            </button>

            <button class="wizard-card" id="receive-btn">
              <div class="wizard-icon">📥</div>
              <div class="wizard-heading">Receive Parcel</div>
              <div class="wizard-text">Receive something from another country.</div>
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
          ${backLinkHtml()}
          <div class="wizard-progress">${progressLabel(2)}</div>
          <h2 class="wizard-title">Where is it travelling?</h2>

          <div class="wizard-options">
            <button class="wizard-card" id="ug-india">🇺🇬<br><br>Uganda → India</button>
            <button class="wizard-card" id="india-ug">🇮🇳<br><br>India → Uganda</button>
          </div>
        </div>
      `;

      wireBackLink(view);

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

    case 3: {
      const title = isReceive ? "What are you receiving?" : "What are you sending?";
      view.innerHTML = `
        <div class="wizard">
          ${backLinkHtml()}
          <div class="wizard-progress">${progressLabel(3)}</div>
          <h2 class="wizard-title">${title}</h2>

          <div class="category-grid">
            <button class="category-card" data-category="food">🍌<span>Food</span></button>
            <button class="category-card" data-category="clothes">👕<span>Clothes</span></button>
            <button class="category-card" data-category="medicine">💊<span>Medicine</span></button>
            <button class="category-card" data-category="electronics">💻<span>Electronics</span></button>
            <button class="category-card" data-category="documents">📄<span>Documents</span></button>
            <button class="category-card" data-category="other">📦<span>Other</span></button>
          </div>

          <div id="other-box"></div>
        </div>
      `;

      wireBackLink(view);

      document.querySelectorAll(".category-card").forEach((card) => {
        card.onclick = () => {
          parcelWizard.data.category = card.dataset.category;

          if (card.dataset.category === "other") {
            document.getElementById("other-box").innerHTML = `
              <label style="margin-top:24px;">Describe your parcel</label>
              <textarea id="other-description" rows="4" placeholder="Describe what you are sending...">${escapeHtml(parcelWizard.data.otherDescription || "")}</textarea>
              <button class="btn btn-block" style="margin-top:18px;" id="continue-other">Continue</button>
            `;

            document.getElementById("continue-other").onclick = () => {
              parcelWizard.data.otherDescription = document.getElementById("other-description").value.trim();
              parcelWizard.step = 4;
              renderParcelStep(view);
            };
            return;
          }

          parcelWizard.step = 4;
          renderParcelStep(view);
        };
      });
      break;
    }

    // --- STEP 4: origin/collection method. Same 3 options regardless of
    // direction — the "origin" is India for india_to_uganda, Uganda for
    // uganda_to_india. Copy adapts to mode (send vs receive framing). ---
    case 4: {
      const title = isReceive ? "How will it reach Tumya office?" : "How should we collect it?";
      view.innerHTML = `
        <div class="wizard">
          ${backLinkHtml()}
          <div class="wizard-progress">${progressLabel(4)}</div>
          <h2 class="wizard-title">${title}</h2>

          <div class="wizard-options">
            <button class="wizard-card" id="tumya-delivery">
              <div class="wizard-icon">🚚</div>
              <div class="wizard-heading">Tumya Delivery</div>
              <div class="wizard-text">We'll collect it.</div>
            </button>

            <button class="wizard-card" id="my-boda">
              <div class="wizard-icon">🛵</div>
              <div class="wizard-heading">My Boda</div>
              <div class="wizard-text">My rider will hand it over.</div>
            </button>

            <button class="wizard-card" id="self-drop">
              <div class="wizard-icon">📍</div>
              <div class="wizard-heading">Self Drop-off</div>
              <div class="wizard-text">I'll drop it at a Tumya point.</div>
            </button>
          </div>
        </div>
      `;

      wireBackLink(view);

      document.getElementById("tumya-delivery").onclick = () => {
        parcelWizard.data.pickup = "tumya";
        parcelWizard.step = 5;
        renderParcelStep(view);
      };

      document.getElementById("my-boda").onclick = () => {
        parcelWizard.data.pickup = "boda";
        parcelWizard.step = 5;
        renderParcelStep(view);
      };

      document.getElementById("self-drop").onclick = () => {
        parcelWizard.data.pickup = "self";
        parcelWizard.step = 5;
        renderParcelStep(view);
      };
      break;
    }

    // --- STEP 5: origin sub-detail, branches on the step-4 choice. ---
    case 5: {
      if (parcelWizard.data.pickup === "tumya") {
        const title = isReceive ? "Where should Tumya find it?" : "Where should we collect it?";
        renderCollectLocationStep(view, title);
      } else if (parcelWizard.data.pickup === "boda") {
        renderBodaStep(view, "Tell us about your rider", {
          name: "boda_name",
          phone: "boda_phone",
          notes: "boda_notes",
        });
      } else {
        renderPointSelectStep(view, "Choose a drop-off point", "pickup_point_id");
      }
      break;
    }

    // --- STEP 6: destination step. Content depends on DIRECTION, since
    // Uganda is where Tumya has its own delivery/pickup-point network, while
    // the India side is currently just a plain recipient address + contact. ---
    case 6: {
      if (direction === "india_to_uganda") {
        const title = isReceive ? "How would you like to receive it in Uganda?" : "In Uganda, how should it be delivered?";
        view.innerHTML = `
          <div class="wizard">
            ${backLinkHtml()}
            <div class="wizard-progress">${progressLabel(6)}</div>
            <h2 class="wizard-title">${title}</h2>

            <div class="wizard-options">
              <button class="wizard-card" id="drop-tumya">
                <div class="wizard-icon">🚚</div>
                <div class="wizard-heading">Tumya Delivery</div>
                <div class="wizard-text">We'll deliver it to you.</div>
              </button>

              <button class="wizard-card" id="drop-boda">
                <div class="wizard-icon">🛵</div>
                <div class="wizard-heading">My Boda</div>
                <div class="wizard-text">My rider will collect it from you.</div>
              </button>

              <button class="wizard-card" id="drop-self">
                <div class="wizard-icon">📍</div>
                <div class="wizard-heading">Self Pickup</div>
                <div class="wizard-text">I'll collect it at a Tumya point.</div>
              </button>
            </div>
          </div>
        `;

        wireBackLink(view);

        document.getElementById("drop-tumya").onclick = () => {
          parcelWizard.data.dropMethod = "tumya";
          parcelWizard.step = 7;
          renderParcelStep(view);
        };
        document.getElementById("drop-boda").onclick = () => {
          parcelWizard.data.dropMethod = "boda";
          parcelWizard.step = 7;
          renderParcelStep(view);
        };
        document.getElementById("drop-self").onclick = () => {
          parcelWizard.data.dropMethod = "self";
          parcelWizard.step = 7;
          renderParcelStep(view);
        };
      } else {
        const title = isReceive ? "Where should we deliver it to you in India?" : "Where is it going in India?";
        renderAddressStep(view, title, "drop_address");
      }
      break;
    }

    // --- STEP 7: destination sub-detail. ---
    case 7: {
      if (direction === "india_to_uganda") {
        if (parcelWizard.data.dropMethod === "tumya") {
          renderAddressStep(view, "Enter the delivery address", "drop_address");
        } else if (parcelWizard.data.dropMethod === "boda") {
          renderBodaStep(view, "Tell us about the receiving rider", {
            name: "drop_boda_name",
            phone: "drop_boda_phone",
            notes: "drop_boda_notes",
          });
        } else {
          renderPointSelectStep(view, "Choose a pickup point", "drop_point_id");
        }
      } else {
        renderContactStep(view, "Contact person details");
      }
      break;
    }

    case 8: {
      let originInfo = "";
      if (parcelWizard.data.pickup === "tumya") {
        originInfo = `
          <div class="review-row"><strong>Collection: </strong><span>🚚 Tumya Delivery</span></div>
          <div class="review-row"><strong>Location: </strong><span>${escapeHtml(parcelWizard.data.pickup_address || "-")}</span></div>
        `;
      } else if (parcelWizard.data.pickup === "boda") {
        originInfo = `
          <div class="review-row"><strong>Collection: </strong><span>🛵 My Boda</span></div>
          <div class="review-row"><strong>Driver: </strong><span>${escapeHtml(parcelWizard.data.boda_name || "-")}</span></div>
          <div class="review-row"><strong>Phone: </strong><span>${escapeHtml(parcelWizard.data.boda_phone || "-")}</span></div>
        `;
      } else if (parcelWizard.data.pickup === "self") {
        const point = pickupPointsCache.find((p) => p.id === parcelWizard.data.pickup_point_id);
        originInfo = `
          <div class="review-row"><strong>Collection: </strong><span>📍 Self Drop-off</span></div>
          <div class="review-row"><strong>Point: </strong><span>${escapeHtml(point ? `${point.name} — ${point.area}` : "-")}</span></div>
        `;
      }

      let destInfo = "";
      if (direction === "india_to_uganda") {
        if (parcelWizard.data.dropMethod === "tumya") {
          destInfo = `
            <div class="review-row"><strong>Delivery: </strong><span>🚚 Tumya Delivery</span></div>
            <div class="review-row"><strong>Address: </strong><span>${escapeHtml(parcelWizard.data.drop_address || "-")}</span></div>
          `;
        } else if (parcelWizard.data.dropMethod === "boda") {
          destInfo = `
            <div class="review-row"><strong>Delivery: </strong><span>🛵 My Boda</span></div>
            <div class="review-row"><strong>Driver: </strong><span>${escapeHtml(parcelWizard.data.drop_boda_name || "-")}</span></div>
            <div class="review-row"><strong>Phone: </strong><span>${escapeHtml(parcelWizard.data.drop_boda_phone || "-")}</span></div>
          `;
        } else if (parcelWizard.data.dropMethod === "self") {
          const point = pickupPointsCache.find((p) => p.id === parcelWizard.data.drop_point_id);
          destInfo = `
            <div class="review-row"><strong>Delivery: </strong><span>📍 Self Pickup</span></div>
            <div class="review-row"><strong>Point: </strong><span>${escapeHtml(point ? `${point.name} — ${point.area}` : "-")}</span></div>
          `;
        }
      } else {
        destInfo = `
          <div class="review-row"><strong>Delivery Address: </strong><span>${escapeHtml(parcelWizard.data.drop_address || "-")}</span></div>
          <div class="review-row"><strong>Contact: </strong><span>${escapeHtml(parcelWizard.data.drop_contact_name || "-")}</span></div>
          <div class="review-row"><strong>Phone: </strong><span>${escapeHtml(parcelWizard.data.drop_contact_phone || "-")}</span></div>
        `;
      }

      const categoryLabel =
        parcelWizard.data.category === "other"
          ? (parcelWizard.data.otherDescription || "Other")
          : parcelWizard.data.category;

      view.innerHTML = `
        <div class="wizard">
          <div class="wizard-progress">${progressLabel(8)}</div>
          <h2 class="wizard-title">Review Your Parcel Details</h2>

          <div class="review-card">
            <div class="review-row"><strong>Action: </strong><span>${escapeHtml(parcelWizard.data.mode)}</span></div>
            <div class="review-row"><strong>Direction: </strong><span>${escapeHtml(parcelWizard.data.direction)}</span></div>
            <div class="review-row"><strong>What: </strong><span>${escapeHtml(categoryLabel)}</span></div>
            ${originInfo}
            ${destInfo}
          </div>

          <div style="display:flex;gap:12px;margin-top:24px;">
            <button class="btn btn-secondary" style="flex:1" id="backParcelBtn">Back</button>
            <button class="btn btn-block" style="flex:2" id="submitParcelBtn">Submit Parcel</button>
          </div>
        </div>
      `;

      document.getElementById("backParcelBtn").onclick = () => {
        parcelWizard.step = 7;
        renderParcelStep(view);
      };

      document.getElementById("submitParcelBtn").onclick = async () => {
        try {
          const payload = {
            send_or_receive: parcelWizard.data.mode,
            direction: parcelWizard.data.direction,
            description: categoryLabel,
            photo_url: null,

            pickup_handler_type:
              parcelWizard.data.pickup === "tumya"
                ? "you_deliver"
                : parcelWizard.data.pickup === "boda"
                ? "own_agent"
                : "self_pickup",
            pickup_point_id: parcelWizard.data.pickup === "self" ? parcelWizard.data.pickup_point_id : null,
            pickup_agent_name: parcelWizard.data.boda_name || null,
            pickup_agent_phone: parcelWizard.data.boda_phone || null,
            pickup_notes: parcelWizard.data.boda_notes || null,
            pickup_address: parcelWizard.data.pickup_address || null,

            drop_handler_type:
              direction === "india_to_uganda"
                ? parcelWizard.data.dropMethod === "tumya"
                  ? "you_deliver"
                  : parcelWizard.data.dropMethod === "boda"
                  ? "own_agent"
                  : "self_pickup"
                : "you_deliver",
            drop_point_id: direction === "india_to_uganda" && parcelWizard.data.dropMethod === "self" ? parcelWizard.data.drop_point_id : null,
            drop_agent_name:
              direction === "india_to_uganda"
                ? parcelWizard.data.drop_boda_name || null
                : parcelWizard.data.drop_contact_name || null,
            drop_agent_phone:
              direction === "india_to_uganda"
                ? parcelWizard.data.drop_boda_phone || null
                : parcelWizard.data.drop_contact_phone || null,
            drop_notes: parcelWizard.data.drop_boda_notes || null,
            drop_address: parcelWizard.data.drop_address || null,
          };

          const result = await Api.submitParcel(payload);

          view.innerHTML = `
            <div class="wizard success-screen">
              <div style="font-size:70px;">✅</div>
              <h2>Parcel Request Submitted</h2>
              <p>Your parcel request has been received We will get in touch with you soon.</p>

              <div class="review-card">
                <div class="review-row"><strong>Order ID: </strong><span>${escapeHtml(result.order.tracking_code)}</span></div>
              </div>

              <button class="btn btn-block" id="trackNowBtn">Track Parcel</button>
            </div>
          `;

          document.getElementById("trackNowBtn").onclick = () => {
            goto("orders");
          };
        } catch (err) {
          toast(err.message, true);
        }
      };
      break;
    }
  }
}
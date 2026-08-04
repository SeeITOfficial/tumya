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

// Internal step 7 has no screen of its own for uganda_to_india — it's a
// pure pass-through straight to review (see case 7 below), so the user only
// ever sees 7 distinct screens on that flow, not 8. Progress label needs to
// reflect what's actually shown, not the raw internal step count, or the
// last screen reads "Step 8 of 8" after only 7 screens were seen.
function progressLabel(step) {
  const direction = parcelWizard.data.direction;
  const skipsStep7 = direction === "uganda_to_india";

  const total = skipsStep7 ? TOTAL_STEPS - 1 : TOTAL_STEPS;
  const display = skipsStep7 && step > 7 ? step - 1 : step;

  return `Step ${display} of ${total}`;
}

// Small shared "back" link, added consistently from step 2 onward.
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
// at the ORIGIN or DESTINATION side. Shared across origin (step 5) and
// India-destination (step 6 / step 7) uses.
//
// allowCurrentLocation lets a caller suppress "Use Current Location" when the
// device filling out the form isn't physically at the location being
// captured (e.g. a receiver in India specifying a pickup point in Uganda).
function renderCollectLocationStep(
  view,
  title,
  addressKey = "pickup_address",
  latKey = "pickup_lat",
  lngKey = "pickup_lng",
  allowCurrentLocation = true,
) {
  view.innerHTML = `
    <div class="wizard">
      ${backLinkHtml()}
      <div class="wizard-progress">${progressLabel(parcelWizard.step)}</div>
      <h2 class="wizard-title">${title}</h2>

      <div class="wizard-options">
        ${
          allowCurrentLocation
            ? `<button class="wizard-card" id="current-location">
                📍
                <br><br>
                Use Current Location
              </button>`
            : ""
        }

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

  const currentLocationBtn = document.getElementById("current-location");
  if (currentLocationBtn) {
    currentLocationBtn.onclick = () => {
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
          parcelWizard.data[addressKey] = `${latitude}, ${longitude}`;
          parcelWizard.data[latKey] = latitude;
          parcelWizard.data[lngKey] = longitude;

          if (accuracy > 5000) {
            // City-level accuracy — likely IP-based, not GPS. Warn the user.
            toast(
              `⚠️ Location is only accurate to ~${Math.round(accuracy / 1000)}km. This may be your city, not your exact location. Please use "Enter Manually" for a precise address.`,
              true,
            );
          }

          parcelWizard.step += 1;
          renderParcelStep(view);
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
  }

  document.getElementById("search-location").onclick = () => {
    document.getElementById("location-extra").innerHTML = `
      <label>Search for a place</label>

      <input
        id="search-box"
        placeholder="Search street, landmark or building..."
        autocomplete="off"
      >

      <div
        id="search-results"
        style="
          margin-top:10px;
          border:1px solid #eee;
          border-radius:12px;
          overflow:hidden;
        "
      ></div>
    `;

    const input = document.getElementById("search-box");
    const results = document.getElementById("search-results");

    let timer;

    input.oninput = () => {

      clearTimeout(timer);

      const q = input.value.trim();

      if (q.length < 3) {
        results.innerHTML = "";
        return;
      }

      timer = setTimeout(async () => {

        try {

          const r = await fetch(
            `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`
          );

          const places = await r.json();

          results.innerHTML = places.map(place => `
            <div
              class="search-result"
              data-lat="${place.lat}"
              data-lon="${place.lon}"
              data-address="${place.display_name}"
              style="
                padding:14px;
                border-bottom:1px solid #eee;
                cursor:pointer;
              "
            >
              📍 ${place.display_name}
            </div>
          `).join("");

          document.querySelectorAll(".search-result").forEach(item => {

            item.onclick = () => {

              parcelWizard.data[addressKey] =
                item.dataset.address;

              parcelWizard.data[latKey] =
                Number(item.dataset.lat);

              parcelWizard.data[lngKey] =
                Number(item.dataset.lon);

              parcelWizard.step += 1;

              renderParcelStep(view);

            };

          });

        } catch {

          results.innerHTML =
            "<div style='padding:12px'>No results found.</div>";

        }

      },300);

    };

  };

  document.getElementById("manual-location").onclick = () => {
    document.getElementById("location-extra").innerHTML = `
      <label>Address</label>
      <textarea id="manual-address" rows="4" placeholder="Enter full address"></textarea>
      <button class="btn btn-block" id="continue-manual">Continue</button>
    `;

    document.getElementById("continue-manual").onclick = () => {
      parcelWizard.data[addressKey] = document.getElementById("manual-address").value;
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
// side.
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

          <div style="margin-top: 40px; padding: 10px 0; text-align: center; pointer-events: none; user-select: none; overflow: hidden;">
            <svg width="100%" height="160" viewBox="0 0 400 160" style="max-width: 100%; display: block; margin: 0 auto;">
              <defs>
                <pattern id="dotGrid" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="1.5" fill="var(--ink)" opacity="0.03" />
                </pattern>
                <path id="topArc" d="M -30,-6 A 30,30 0 0,1 30,-6" fill="none" />
                <path id="bottomArc" d="M 26,14 A 28,28 0 0,1 -26,14" fill="none" />
              </defs>

              <rect width="100%" height="100%" fill="url(#dotGrid)" />

              <!-- Wavy postal cancellation lines -->
              <path d="M -20 80 Q 80 50 180 80 T 420 80" fill="none" stroke="var(--ink)" stroke-width="2.5" opacity="0.04"/>
              <path d="M -20 95 Q 80 65 180 95 T 420 95" fill="none" stroke="var(--ink)" stroke-width="2.5" opacity="0.04"/>
              <path d="M -20 110 Q 80 80 180 110 T 420 110" fill="none" stroke="var(--ink)" stroke-width="2.5" opacity="0.04"/>

              <!-- Big text -->
              <text x="180" y="85" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-weight="900" font-size="46" fill="var(--ink)" opacity="0.04" letter-spacing="2">
                DISTANCE
              </text>
              <text x="180" y="132" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-weight="900" font-size="40" fill="var(--ink)" opacity="0.04" letter-spacing="2">
                ENDS HERE
              </text>

              <!-- Authentic TUMYA Postal Stamp -->
              <g transform="translate(300, 80) rotate(-16)">
                <!-- Outer Rings -->
                <circle cx="0" cy="0" r="50" fill="rgba(242, 104, 10, 0.04)" stroke="var(--orange-600)" stroke-width="4" opacity="0.45"/>
                <circle cx="0" cy="0" r="44" fill="none" stroke="var(--orange-600)" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.45"/>

                <!-- Circular Text -->
                <text fill="var(--orange-600)" font-family="monospace" font-weight="bold" font-size="9" opacity="0.55" letter-spacing="1">
                  <textPath href="#topArc" startOffset="50%" text-anchor="middle">EXPRESS ✈ LOGISTICS</textPath>
                </text>
                <text fill="var(--orange-600)" font-family="monospace" font-weight="bold" font-size="8" opacity="0.55" letter-spacing="1">
                  <textPath href="#bottomArc" startOffset="50%" text-anchor="middle">UGANDA ↔ INDIA</textPath>
                </text>

                <!-- Center Text -->
                <text x="0" y="5" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-weight="900" font-size="22" fill="var(--orange-600)" letter-spacing="2" opacity="0.55">
                  TUMYA
                </text>
                <text x="0" y="20" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="7" fill="var(--orange-600)" opacity="0.55" letter-spacing="3">
                  APPROVED
                </text>
              </g>
            </svg>
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

    // --- STEP 4: origin/collection method. India has no boda (motorcycle
    // taxi) network, so when direction is india_to_uganda (origin = India)
    // that option is dropped and only Tumya Pickup / Self Drop-off show. ---
    case 4: {
      const title = isReceive ? "How will it reach Tumya office?" : "How will it reach Tumya?";
      const showBoda = direction !== "india_to_uganda";

      view.innerHTML = `
        <div class="wizard">
          ${backLinkHtml()}
          <div class="wizard-progress">${progressLabel(4)}</div>
          <h2 class="wizard-title">${title}</h2>

          <div class="wizard-options">
            <button class="wizard-card" id="tumya-delivery">
              <div class="wizard-icon">🚚</div>
              <div class="wizard-heading">Tumya Pickup</div>
              <div class="wizard-text">We'll collect it.</div>
            </button>

            ${
              showBoda
                ? `<button class="wizard-card" id="my-boda">
                    <div class="wizard-icon">🛵</div>
                    <div class="wizard-heading">My Boda</div>
                    <div class="wizard-text">My rider will hand it over to Tumya.</div>
                  </button>`
                : ""
            }

            <button class="wizard-card" id="self-drop">
              <div class="wizard-icon">📍</div>
              <div class="wizard-heading">Self Drop-off</div>
              <div class="wizard-text">Someone will drop it at a Tumya point.</div>
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

      const bodaBtn = document.getElementById("my-boda");
      if (bodaBtn) {
        bodaBtn.onclick = () => {
          parcelWizard.data.pickup = "boda";
          parcelWizard.step = 5;
          renderParcelStep(view);
        };
      }

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
        // Origin (pickup) is always in Uganda. If the person filling this
        // form is the receiver on an uganda_to_india parcel, they're
        // physically in India — "Use Current Location" would capture the
        // wrong country, so it's hidden in that one case.
        const allowCurrentLocation = !(isReceive && direction === "uganda_to_india");
        renderCollectLocationStep(
          view,
          "Where should Tumya find it?",
          "pickup_address",
          "pickup_lat",
          "pickup_lng",
          allowCurrentLocation,
        );
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
        const title = isReceive
          ? "Where are you in India?"
          : "Where is it going in India?";

        renderCollectLocationStep(view, title, "drop_address", "drop_lat", "drop_lng");
      }
      break;
    }

    // --- STEP 7: destination sub-detail (india_to_uganda only). For
    // uganda_to_india there's no sub-detail — step 6 already collected the
    // India address directly — so this just forwards straight to review. ---
    case 7: {
      if (direction === "india_to_uganda") {
        if (parcelWizard.data.dropMethod === "tumya") {
          renderCollectLocationStep(
            view,
            "Enter the delivery address",
            "drop_address",
            "drop_lat",
            "drop_lng",
          );
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
        parcelWizard.step = 8;
        renderParcelStep(view);
        return;
      }
      break;
    }

    // --- STEP 8: review + submit ---
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
          <div class="review-row">
            <strong>Delivery Address: </strong>
            <span>${escapeHtml(parcelWizard.data.drop_address || "-")}</span>
          </div>
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
        // For india_to_uganda there's a real sub-detail screen at step 7.
        // For uganda_to_india, step 7 has no UI of its own (it just forwards
        // straight to review), so going back has to skip it and land on 6.
        parcelWizard.step = direction === "india_to_uganda" ? 7 : 6;
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
            pickup_lat: parcelWizard.data.pickup_lat || null,
            pickup_lng: parcelWizard.data.pickup_lng || null,

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
                : null,

            drop_agent_phone:
              direction === "india_to_uganda"
                ? parcelWizard.data.drop_boda_phone || null
                : null,
            drop_notes: parcelWizard.data.drop_boda_notes || null,
            drop_address: parcelWizard.data.drop_address || null,
            drop_lat: parcelWizard.data.drop_lat || null,
            drop_lng: parcelWizard.data.drop_lng || null,
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
/**
 * pwa-install.js
 *
 * Production-ready PWA install prompt for Tumya.
 *
 * Behaviour contract
 * ──────────────────
 * • Presents a custom "Install Tumya" modal as soon as `beforeinstallprompt`
 *   fires (no waiting for user interaction).
 * • Prompts on every visit until the app is installed; dismissal is intentionally
 *   NOT stored persistently so the prompt re-appears next visit.
 * • Stops prompting once `appinstalled` fires or when `display-mode: standalone`
 *   / `navigator.standalone` is already true (already installed).
 * • On iOS/Safari (where `beforeinstallprompt` is unavailable) shows platform-
 *   specific share-sheet instructions instead.
 * • Cleans up every event listener it registers to prevent memory leaks.
 * • Uses no global variables and exports a single `initPwaInstall` function.
 */

// ─── Persistence key ────────────────────────────────────────────────────────

/** localStorage key written only after a successful installation. */
const INSTALLED_KEY = "tumya_pwa_installed";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true when the app is running as an installed PWA. */
function isRunningStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    /** @type {any} */ (navigator).standalone === true
  );
}

/** Returns true when the user has previously completed installation. */
function wasInstalled() {
  return localStorage.getItem(INSTALLED_KEY) === "1";
}

/** Mark installation as completed so we never show the prompt again. */
function markInstalled() {
  localStorage.setItem(INSTALLED_KEY, "1");
}

// ─── Modal HTML ──────────────────────────────────────────────────────────────

/**
 * Build the install modal element.
 *
 * @param {"chromium" | "ios"} variant
 * @returns {HTMLElement}
 */
function buildModal(variant) {
  const el = document.createElement("div");
  el.id = "pwa-install-modal";
  el.className = "pwa-install-overlay";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "pwa-install-title");

  const isIos = variant === "ios";

  el.innerHTML = `
    <div class="pwa-install-card" id="pwa-install-card">

      <div class="pwa-install-icon-wrap">
        <img
          src="/icons/icon-192.png"
          class="pwa-install-icon"
          alt="Tumya app icon"
          width="64"
          height="64"
        >
      </div>

      <h2 class="pwa-install-title" id="pwa-install-title">
        Install Tumya
      </h2>

      <p class="pwa-install-body">
        Install Tumya for a faster experience, offline support, and home screen access.
      </p>

      ${isIos ? `
        <div class="pwa-install-ios-steps">
          <div class="pwa-install-ios-step">
            <span class="pwa-install-ios-num">1</span>
            <span>
              Tap the <strong>Share</strong> button
              <span class="pwa-install-ios-share-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              </span>
              in Safari's toolbar.
            </span>
          </div>
          <div class="pwa-install-ios-step">
            <span class="pwa-install-ios-num">2</span>
            <span>Scroll down and tap <strong>"Add to Home Screen"</strong>.</span>
          </div>
          <div class="pwa-install-ios-step">
            <span class="pwa-install-ios-num">3</span>
            <span>Tap <strong>"Add"</strong> to confirm.</span>
          </div>
        </div>

        <button
          class="btn btn-block pwa-install-dismiss"
          id="pwa-install-close"
        >
          Got it
        </button>
      ` : `
        <div class="pwa-install-actions">
          <button
            class="btn btn-block"
            id="pwa-install-accept"
          >
            Install
          </button>

          <button
            class="btn btn-outline btn-block"
            id="pwa-install-dismiss"
          >
            Not now
          </button>
        </div>
      `}

    </div>
  `;

  return el;
}

// ─── Modal lifecycle ─────────────────────────────────────────────────────────

/** Remove the modal from the DOM. */
function removeModal() {
  const existing = document.getElementById("pwa-install-modal");
  if (existing) {
    existing.remove();
  }
}

/**
 * Show the iOS instruction modal.
 * Dismissed via "Got it" — no persistent storage (user must only tap once
 * per visit; next visit the function is re-evaluated and will show again
 * only if we decide to for iOS since `beforeinstallprompt` never fires there).
 *
 * For iOS we only show it once per session to avoid spamming, using a
 * session-scoped in-memory flag.
 *
 * @param {boolean} shownThisSession
 */
function showIosModal(shownThisSession) {
  if (shownThisSession) return;

  const modal = buildModal("ios");
  document.body.appendChild(modal);

  // Animate in on next frame to allow CSS transition to play.
  requestAnimationFrame(() => {
    modal.classList.add("pwa-install-overlay--visible");
  });

  const closeBtn = document.getElementById("pwa-install-close");

  /** @type {() => void} */
  function onClose() {
    closeBtn.removeEventListener("click", onClose);
    modal.classList.remove("pwa-install-overlay--visible");
    // Wait for exit transition then remove.
    modal.addEventListener("transitionend", removeModal, { once: true });
  }

  closeBtn.addEventListener("click", onClose);
}

/**
 * Show the Chromium install modal.
 *
 * @param {BeforeInstallPromptEvent} deferredPrompt
 * @returns {Promise<void>}
 */
async function showChromiumModal(deferredPrompt) {
  removeModal(); // safety: never stack duplicates

  const modal = buildModal("chromium");
  document.body.appendChild(modal);

  requestAnimationFrame(() => {
    modal.classList.add("pwa-install-overlay--visible");
  });

  const acceptBtn  = document.getElementById("pwa-install-accept");
  const dismissBtn = document.getElementById("pwa-install-dismiss");

  /** Close the modal with an optional exit transition. */
  function closeModal() {
    acceptBtn.removeEventListener("click",  onAccept);
    dismissBtn.removeEventListener("click", onDismiss);

    modal.classList.remove("pwa-install-overlay--visible");
    modal.addEventListener("transitionend", removeModal, { once: true });
  }

  async function onAccept() {
    closeModal();

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === "accepted") {
        markInstalled();
        // `appinstalled` will also fire; handled in initPwaInstall.
      }
      // If dismissed: no persistent flag → will prompt again next visit.
    } catch {
      // Prompt already used or unavailable — silently ignore.
    }
  }

  function onDismiss() {
    closeModal();
    // Intentionally no persistent flag → prompt again next visit.
  }

  acceptBtn.addEventListener("click",  onAccept);
  dismissBtn.addEventListener("click", onDismiss);
}

// ─── Platform detection ───────────────────────────────────────────────────────

/** True when running in Safari on iOS/iPadOS. */
function isIosSafari() {
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  // Chrome on iOS reports "CriOS"; Firefox reports "FxiOS". Exclude them.
  const isSafari = /safari/i.test(ua) && !/chrome|crios|fxios|edgios/i.test(ua);
  return isIos && isSafari;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise the PWA install prompt.
 *
 * Call this once per page load. The function self-guards against duplicate
 * invocations via a module-scoped flag.
 */
let _initialized = false;

export function initPwaInstall() {
  // Guard: run only once per page load.
  if (_initialized) return;
  _initialized = true;

  // Already installed and running as a PWA → nothing to do.
  if (isRunningStandalone()) return;

  // Previously installed (browser uninstalled → now in browser again) is
  // handled by the absence of standalone mode above. `wasInstalled()` only
  // gates re-prompting after explicit `appinstalled` event.
  // But if the app is truly uninstalled the flag stays; we must clear it so
  // prompting resumes. We detect "truly uninstalled" by the fact that
  // isRunningStandalone() is false and the display-mode media query doesn't
  // match — which is already the case here (we would have returned above).
  //
  // Per requirement 4: if user later uninstalls and revisits in the browser,
  // the INSTALLED_KEY should not block prompting. We clear it now whenever
  // we're in browser mode, because if they were truly installed they'd be
  // in standalone mode (caught above). The flag only prevents duplicate
  // prompts within a single installation lifecycle.
  //
  // So: clear the key here to enable re-prompting after uninstall.
  localStorage.removeItem(INSTALLED_KEY);

  // ── iOS Safari path ──────────────────────────────────────────────────────

  if (isIosSafari()) {
    // Use session-scoped flag (in-memory) so we only show once per session.
    let shownThisSession = false;

    // We cannot show the modal until the DOM is ready. If the script runs
    // before DOMContentLoaded that's handled by waiting; otherwise it fires
    // immediately (readyState check).
    function showIos() {
      showIosModal(shownThisSession);
      shownThisSession = true;
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", showIos, { once: true });
    } else {
      // Slight defer so the page paint is not blocked.
      setTimeout(showIos, 400);
    }

    return; // iOS has no beforeinstallprompt; nothing more to wire up.
  }

  // ── Chromium / Edge / Desktop path ──────────────────────────────────────

  /** @type {BeforeInstallPromptEvent | null} */
  let deferredPrompt = null;

  /**
   * Handler for `beforeinstallprompt`.
   * Defined as a named reference so it can be removed precisely.
   *
   * @param {Event} e
   */
  function onBeforeInstallPrompt(e) {
    // Prevent the default mini-infobar from appearing.
    e.preventDefault();

    // If already installed (e.g. flagged via appinstalled event in a prior
    // load), do not show our modal.
    if (wasInstalled()) return;

    deferredPrompt = /** @type {BeforeInstallPromptEvent} */ (e);

    // Show immediately — requirement 1.
    showChromiumModal(deferredPrompt);
  }

  /**
   * Handler for `appinstalled`.
   * Fires when the browser confirms the app was added to the home screen.
   */
  function onAppInstalled() {
    markInstalled();
    removeModal();

    // Clean up — no further prompting needed.
    window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.removeEventListener("appinstalled",        onAppInstalled);
    deferredPrompt = null;
  }

  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  window.addEventListener("appinstalled",        onAppInstalled);
}

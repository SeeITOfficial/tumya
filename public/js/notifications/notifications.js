import { Api } from "../api.js";
import { urlBase64ToUint8Array } from "../shared/utils.js";

// --- Push setup (best-effort, silently no-ops if unsupported/unconfigured) ---
export async function setupPush() {
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

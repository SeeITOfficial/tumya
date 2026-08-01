import { AdminApi } from "../admin.js";

export async function renderMarketing(view) {
  view.innerHTML = `
    <div style="max-width:600px;">
      <h2 style="margin-top:0;">Marketing Blasts</h2>
      <p style="color:var(--ink-soft); margin-bottom:24px;">Send a manual push notification to all subscribed customers instantly.</p>
      
      <div class="card" style="padding:24px;">
        <label>Notification Title</label>
        <input id="m-title" placeholder="e.g. 🔥 Weekend Sale!" />
        
        <label>Message</label>
        <textarea id="m-body" rows="3" placeholder="e.g. Get 20% off all groceries this weekend. Tap to shop now."></textarea>
        
        <label>Link (URL when tapped)</label>
        <input id="m-url" placeholder="e.g. / (defaults to home)" />
        
        <button id="btn-blast" class="btn" style="margin-top:16px;">Send Blast Now</button>
        <p id="m-result" style="margin-top:16px; font-weight:600;"></p>
      </div>
    </div>
  `;

  document.getElementById("btn-blast").addEventListener("click", async () => {
    const title = document.getElementById("m-title").value.trim();
    const body = document.getElementById("m-body").value.trim();
    const url = document.getElementById("m-url").value.trim() || "/";
    const resEl = document.getElementById("m-result");

    if (!title || !body) {
      resEl.textContent = "Title and Message are required.";
      resEl.style.color = "var(--danger)";
      return;
    }

    if (!confirm("Are you sure you want to send this notification to ALL customers?")) return;

    resEl.textContent = "Sending...";
    resEl.style.color = "var(--ink-soft)";

    try {
      const res = await AdminApi.sendMarketingBlast({ title, body, url });
      resEl.textContent = `Blast complete! Successfully sent to ${res.sent} devices. (${res.failed} failed/expired).`;
      resEl.style.color = "var(--success)";
      
      document.getElementById("m-title").value = "";
      document.getElementById("m-body").value = "";
      document.getElementById("m-url").value = "";
    } catch (err) {
      resEl.textContent = err.message;
      resEl.style.color = "var(--danger)";
    }
  });
}

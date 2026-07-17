export function toast(msg, isError = false) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

export const CATALOG_STOCK_STATUSES = ["in_stock", "out_of_stock", "coming_soon"];

export function stockStatusLabel(status) {
  return status.replace(/_/g, " ");
}

export function stockBadgeClass(status) {
  if (status === "in_stock") return "badge-ok";
  if (status === "coming_soon") return "badge";
  return "badge-warn";
}

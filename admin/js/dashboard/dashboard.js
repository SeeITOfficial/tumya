export function buildDashboardSection(orders) {
  const pendingQuotes = orders.filter(
    (o) => o.status === "pending_quote",
  ).length;

  const paymentPending = orders.filter(
    (o) => o.status === "payment_pending",
  ).length;

  const inTransit = orders.filter(
    (o) => o.status === "in_transit",
  ).length;

  const revenue = orders
    .filter((o) => o.total_amount != null)
    .reduce((sum, o) => sum + Number(o.total_amount), 0);

  return `
    <h2>Dashboard</h2>

    <div class="stats-grid">

      <div class="stat-card" data-filter="">
        <div class="stat-number">${orders.length}</div>
        <div class="stat-label">Total Orders</div>
      </div>

      <div class="stat-card" data-filter="pending_quote">
        <div class="stat-number">${pendingQuotes}</div>
        <div class="stat-label">Pending Quotes</div>
      </div>

      <div class="stat-card" data-filter="payment_pending">
        <div class="stat-number">${paymentPending}</div>
        <div class="stat-label">Pending Payments</div>
      </div>

      <div class="stat-card" data-filter="in_transit">
        <div class="stat-number">${inTransit}</div>
        <div class="stat-label">In Transit</div>
      </div>

      <div class="stat-card">
        <div class="stat-number">₹${revenue.toFixed(2)}</div>
        <div class="stat-label">Revenue</div>
      </div>

    </div>
  `;
}

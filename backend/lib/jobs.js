const db = require('../db');
const { notifyCustomer, PUSH_ENABLED } = require('./push');

async function runMarketingAutomations() {
  if (!PUSH_ENABLED) return;
  console.log('[Jobs] Running marketing automations...');

  // 1. "We Miss You!"
  // Customers who haven't placed an order in the last 14 days, but have placed orders before.
  // We should also ensure we don't spam them every day after day 14.
  // A simple way is to check if their LAST order was exactly 14 days ago.
  try {
    const missYouCustomers = db.prepare(`
      SELECT customer_id
      FROM orders
      GROUP BY customer_id
      HAVING date(MAX(created_at)) = date(datetime('now', '-14 days'))
    `).all();

    for (const row of missYouCustomers) {
      await notifyCustomer(row.customer_id, {
        title: "We miss you! 🥺",
        body: "It's been a while since your last order. Check out what's new in the catalog!",
        url: "/"
      });
    }
    if (missYouCustomers.length > 0) {
      console.log(`[Jobs] Sent 'We Miss You' to ${missYouCustomers.length} customers.`);
    }

    // 2. "Restock Reminder"
    // Customers whose last order was delivered exactly 21 days ago.
    const restockCustomers = db.prepare(`
      SELECT customer_id
      FROM orders
      WHERE status = 'delivered'
      GROUP BY customer_id
      HAVING date(MAX(updated_at)) = date(datetime('now', '-21 days'))
    `).all();

    for (const row of restockCustomers) {
      await notifyCustomer(row.customer_id, {
        title: "Time to restock? 🛒",
        body: "Your pantry might be getting low! Tap here to restock your favorites.",
        url: "/"
      });
    }
    if (restockCustomers.length > 0) {
      console.log(`[Jobs] Sent 'Restock' to ${restockCustomers.length} customers.`);
    }

  } catch (err) {
    console.error('[Jobs] Error running marketing automations:', err);
  }
}

function startJobs() {
  // Run once immediately on startup if it's a new day, or just run it and let the date check restrict it.
  // It's safer to run it once every 12 hours (43200000 ms) so we hit the date() condition at some point during the day.
  // Since date() ignores time, running it every 12 hours guarantees it fires on the target date.
  
  // Run immediately
  runMarketingAutomations();

  // Run every 12 hours
  setInterval(runMarketingAutomations, 12 * 60 * 60 * 1000);
}

module.exports = {
  startJobs
};

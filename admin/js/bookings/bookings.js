import { AdminApi } from "../admin.js";

export async function renderBookings(view) {

    const bookings = await AdminApi.getBookings();

    if (!bookings.length) {
        view.innerHTML = `
            <div class="empty-state">
                No bookings yet.
            </div>
        `;
        return;
    }

    view.innerHTML = `
        <h2>Bookings</h2>

        <div class="booking-list">

            ${bookings.map(bookingCard).join("")}

        </div>
    `;
}

function bookingCard(b) {

    return `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <h3>${b.product_name}</h3>
                    <div>Customer: <strong>${b.customer_name}</strong></div>
                    <div>Phone: ${b.customer_phone}</div>
                    <div>Qty: ${b.qty}</div>
                    <div>Status: <strong>${b.status}</strong></div>
                </div>
                ${b.status !== 'completed' ? `
                <div>
                    <button class="btn btn-sm" data-confirm-booking="${b.id}">Confirm Order</button>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Add event listener at document level for confirm booking buttons
document.addEventListener("click", async (e) => {
    if (e.target.dataset.confirmBooking) {
        e.target.disabled = true;
        try {
            await AdminApi.confirmBooking(e.target.dataset.confirmBooking);
            alert("Booking confirmed and converted to Order!");
            // Refresh bookings
            document.querySelector('button[data-tab="bookings"]')?.click();
        } catch (err) {
            alert(err.message);
            e.target.disabled = false;
        }
    }
});
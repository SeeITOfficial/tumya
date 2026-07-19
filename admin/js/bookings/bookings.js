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

                    <div>
                        Customer:
                        <strong>${b.customer_name}</strong>
                    </div>

                    <div>
                        Phone:
                        ${b.customer_phone}
                    </div>

                    <div>
                        Qty:
                        ${b.qty}
                    </div>

                    <div>
                        Status:
                        <strong>${b.status}</strong>
                    </div>

                </div>

            </div>

        </div>
    `;
}
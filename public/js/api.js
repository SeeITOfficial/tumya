const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:4000/api"
    : "/api";

export const Api = (() => {
  function token() { return localStorage.getItem('tumya_token'); }
  function setToken(t) { localStorage.setItem('tumya_token', t); }
  function clearToken() { localStorage.removeItem('tumya_token'); }
  function currentUser() {
    const raw = localStorage.getItem('tumya_user');
    return raw ? JSON.parse(raw) : null;
  }
  function setUser(u) { localStorage.setItem('tumya_user', JSON.stringify(u)); }

  async function request(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && token()) headers.Authorization = `Bearer ${token()}`;

    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (err) {
      throw new Error('Cannot reach the server. Check your connection and try again.');
    }

    let data;
    try { data = await res.json(); } catch { data = {}; }

    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  return {
    token, setToken, clearToken, currentUser, setUser,
    identify: (phone, name) => request('/auth/customer/identify', { method: 'POST', body: { phone, name }, auth: false }),
    getCatalog: () => request('/catalog', { auth: false }),
    getPickupPoints: () => request('/pickup-points', { auth: false }),
    placeCatalogOrder: (items, payment_mode, location) => request('/orders/catalog', { method: 'POST', body: { items, payment_mode, ...location } }),
    createCatalogBookings: (items) =>
      request("/catalog/bookings", {
        method: "POST",
        body: { items },
      }),
    myOrders: () => request('/orders/mine'),
    track: (code) => request(`/orders/track/${code}`, { auth: false }),
    submitParcel: (payload) => request('/parcels', { method: 'POST', body: payload }),
    chooseParcelPaymentMethod: (orderId, method) => request(`/parcels/${orderId}/payment/method`, { method: 'POST', body: { method } }),
    submitParcelReference: (orderId, reference_number) => request(`/parcels/${orderId}/payment/reference`, { method: 'POST', body: { reference_number } }),
    vapidKey: () => request('/push/vapid-public-key', { auth: false }),
    pushSubscribe: (sub) => request('/push/subscribe', { method: 'POST', body: sub }),
    cancelOrder: (trackingCode) => request(`/orders/cancel/${trackingCode}`, { method: 'DELETE' }),
  };
})();
const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:4000/api"
    : "/api";


export const Api = (() => {
  function token() {
    return localStorage.getItem("tumya_token");
  }

  function setToken(t) {
    if (!t || typeof t !== "string" || t.trim() === "") {
      throw new Error("Invalid token");
    }
    localStorage.setItem("tumya_token", t);
  }

  function clearToken() {
    localStorage.removeItem("tumya_token");
  }

  /**
   * Retrieves the current authenticated user from local storage.
   * @returns {object|null} The user object or null if not found.
   */
  function currentUser() {
    try {
      const raw = localStorage.getItem("tumya_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setUser(user) {
    if (!user || typeof user !== "object") {
      throw new Error("Invalid user object");
    }
    localStorage.setItem("tumya_user", JSON.stringify(user));
  }

  function clearUser() {
    localStorage.removeItem("tumya_user");
  }

  /**
   * Clears user session and tokens, logging out the user.
   */
  function logout() {
    clearToken();
    clearUser();
  }

  function isLoggedIn() {
    return !!token();
  }

  /**
   * Makes an API request.
   * @param {string} path - The API endpoint path.
   * @param {object} [options] - Request options (method, body, auth).
   * @returns {Promise<any>} The response data.
   */
  async function request(
    path,
    {
      method = "GET",
      body,
      auth = true,
    } = {}
  ) {
    const headers = {
      Accept: "application/json",
    };

    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const jwt = token();

    if (auth) {
      if (!jwt) {
        logout();
        throw new Error("You must sign in to continue.");
      }
      headers.Authorization = `Bearer ${jwt}`;
    }

    let response;

    try {
      response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error(
        "Cannot reach the server. Check your connection and try again."
      );
    }

    let data = {};

    if (response.status !== 204) {
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        try {
          data = await response.json();
        } catch {
          data = {};
        }
      }
    }

    if (response.status === 401) {
      logout();

      if (!location.pathname.includes("login")) {
        location.reload();
      }

      throw new Error("Your session has expired. Please sign in again.");
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        `Request failed (${response.status})`
      );
    }

    return data;
  }

  function resendCode(email, purpose) {
    if (purpose !== "register" && purpose !== "login") {
      throw new Error("Invalid purpose");
    }
    return request("/auth/resend-code", {
      method: "POST",
      body: {
        email,
        purpose,
      },
      auth: false,
    });
  }

  return Object.freeze({
    token,
    setToken,
    clearToken,

    currentUser,
    setUser,
    clearUser,

    logout,
    isLoggedIn,

    resendCode,

    register: (name, email, phone) => {
      if (typeof name !== "string" || typeof email !== "string" || typeof phone !== "string") {
        throw new Error("Invalid input: name, email and phone must be strings.");
      }
      return request("/auth/register", {
        method: "POST",
        body: {
          name,
          email,
          phone,
        },
        auth: false,
      });
    },

    verifyEmail: (email, code) => {
      if (typeof code !== "string") {
        throw new Error("Invalid verification code");
      }
      return request("/auth/verify-email", {
        method: "POST",
        body: {
          email,
          code,
        },
        auth: false,
      });
    },

    login: (email) =>
      request("/auth/login", {
        method: "POST",
        body: {
          email,
        },
        auth: false,
      }),

    verifyLogin: (email, code) => {
      if (typeof code !== "string") {
        throw new Error("Invalid verification code");
      }
      return request("/auth/verify-login", {
        method: "POST",
        body: {
          email,
          code,
        },
        auth: false,
      });
    },

    getCatalog: () =>
      request("/catalog", {
        auth: false,
      }),

    getMarketMode: () =>
      request("/catalog/market_mode", {
        auth: false,
      }),

    getPickupPoints: () =>
      request("/pickup-points", {
        auth: false,
      }),

    placeCatalogOrder: (
      items,
      payment_mode,
      location
    ) =>
      request("/orders/catalog", {
        method: "POST",
        body: {
          items,
          payment_mode,
          ...location,
        },
      }),

    createCatalogBookings: (items) =>
      request("/catalog/bookings", {
        method: "POST",
        body: {
          items,
        },
      }),

    myOrders: () =>
      request("/orders/mine"),

    track: (trackingCode) => {
      if (!trackingCode || typeof trackingCode !== 'string' || trackingCode.trim() === '') {
        throw new Error("Tracking code is required");
      }
      return request(`/orders/track/${trackingCode}`, {
        auth: false,
      });
    },

    submitParcel: (payload) =>
      request("/parcels", {
        method: "POST",
        body: payload,
      }),

    chooseParcelPaymentMethod: (
      orderId,
      method
    ) =>
      request(`/parcels/${orderId}/payment/method`, {
        method: "POST",
        body: {
          method,
        },
      }),

    submitParcelReference: (
      orderId,
      reference_number
    ) => {
      if (!reference_number || typeof reference_number !== 'string' || reference_number.trim() === '') {
        throw new Error("Reference number is required");
      }
      return request(`/parcels/${orderId}/payment/reference`, {
        method: "POST",
        body: {
          reference_number,
        },
      });
    },

    vapidKey: () =>
      request("/push/vapid-public-key", {
        auth: false,
      }),

    pushSubscribe: (subscription) =>
      request("/push/subscribe", {
        method: "POST",
        body: subscription,
      }),

    unsubscribePush: (endpoint) =>
      request("/push/unsubscribe", {
        method: "POST",
        body: {
          endpoint,
        },
      }),

    cancelOrder: (trackingCode) => {
      if (!trackingCode || typeof trackingCode !== 'string' || trackingCode.trim() === '') {
        throw new Error("Tracking code is required");
      }
      return request(`/orders/cancel/${trackingCode}`, {
        method: "DELETE",
      });
    },
  });
})();
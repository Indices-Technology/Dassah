// MarketX API client for DassaAI
//
// Used for:
//   1. Verifying user sessions via /auth/session
//   2. Fetching product data for the marketx skill
//   3. Managing orders, cart, payments
//
// All calls include the MARKETX_API_KEY in the header.

const BASE_URL = process.env.MARKETX_API_URL ?? '';
const API_KEY = process.env.MARKETX_API_KEY ?? '';

if (!BASE_URL) throw new Error('MARKETX_API_URL is not set');

const headers = {
  'Content-Type': 'application/json',
  'X-API-Key': API_KEY,
};

export const marketxClient = {
  // GET /auth/session - Verify token and get current user
  async verifySession(token: string) {
    const res = await fetch(`${BASE_URL}/auth/session`, {
      headers: { ...headers, 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 401) return null;
      throw new Error(`MarketX session verify failed: ${res.status}`);
    }
    return res.json();
  },

  // GET /profile - Get own profile
  async getProfile(token: string) {
    const res = await fetch(`${BASE_URL}/profile`, {
      headers: { ...headers, 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`MarketX profile fetch failed: ${res.status}`);
    return res.json();
  },

  // GET /commerce/products - Search products
  async searchProducts(token: string, query: string, limit = 10) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (query) params.set('search', query);

    const res = await fetch(`${BASE_URL}/commerce/products?${params}`, {
      headers: { ...headers, 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`MarketX product search failed: ${res.status}`);
    return res.json();
  },

  // GET /commerce/products/[id] - Get product detail
  async getProduct(token: string, productId: string) {
    const res = await fetch(`${BASE_URL}/commerce/products/${productId}`, {
      headers: { ...headers, 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`MarketX product fetch failed: ${res.status}`);
    return res.json();
  },

  // GET /commerce/orders - Buyer's orders
  async getOrders(token: string) {
    const res = await fetch(`${BASE_URL}/commerce/orders`, {
      headers: { ...headers, 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`MarketX orders fetch failed: ${res.status}`);
    return res.json();
  },

  // GET /commerce/orders/seller - Seller's orders
  async getSellerOrders(token: string) {
    const res = await fetch(`${BASE_URL}/commerce/orders/seller`, {
      headers: { ...headers, 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`MarketX seller orders fetch failed: ${res.status}`);
    return res.json();
  },

  // PATCH /commerce/orders/[id]/status - Update order status
  async updateOrderStatus(token: string, orderId: string, status: string) {
    const res = await fetch(`${BASE_URL}/commerce/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { ...headers, 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error(`MarketX order status update failed: ${res.status}`);
    return res.json();
  },

  // POST /commerce/orders - Create order
  async createOrder(token: string, items: any[], paymentMethod: string) {
    const res = await fetch(`${BASE_URL}/commerce/orders`, {
      method: 'POST',
      headers: { ...headers, 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ items, paymentMethod }),
    });
    if (!res.ok) throw new Error(`MarketX order creation failed: ${res.status}`);
    return res.json();
  },

  // GET /commerce/cart - Get cart
  async getCart(token: string) {
    const res = await fetch(`${BASE_URL}/commerce/cart`, {
      headers: { ...headers, 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`MarketX cart fetch failed: ${res.status}`);
    return res.json();
  },

  // POST /commerce/cart - Add to cart
  async addToCart(token: string, variantId: string, quantity: number) {
    const res = await fetch(`${BASE_URL}/commerce/cart`, {
      method: 'POST',
      headers: { ...headers, 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ variantId, quantity }),
    });
    if (!res.ok) throw new Error(`MarketX add to cart failed: ${res.status}`);
    return res.json();
  },

  // GET /seller/[id] - Get seller profile
  async getSeller(token: string, sellerId: string) {
    const res = await fetch(`${BASE_URL}/seller/${sellerId}`, {
      headers: { ...headers, 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`MarketX seller fetch failed: ${res.status}`);
    return res.json();
  },

  // GET /seller/[id]/products - Get seller's products
  async getSellerProducts(token: string, sellerId: string) {
    const res = await fetch(`${BASE_URL}/seller/${sellerId}/products`, {
      headers: { ...headers, 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`MarketX seller products fetch failed: ${res.status}`);
    return res.json();
  },

  // GET /commerce/wallet - Get wallet balance
  async getWallet(token: string) {
    const res = await fetch(`${BASE_URL}/commerce/wallet`, {
      headers: { ...headers, 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`MarketX wallet fetch failed: ${res.status}`);
    return res.json();
  },

  // POST /commerce/shipping/calculate - Calculate shipping
  async calculateShipping(token: string, originId: string, destinationId: string, weight: number) {
    const res = await fetch(`${BASE_URL}/commerce/shipping/calculate`, {
      method: 'POST',
      headers: { ...headers, 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ originId, destinationId, weight }),
    });
    if (!res.ok) throw new Error(`MarketX shipping calculation failed: ${res.status}`);
    return res.json();
  },

  // GET /commerce/shipping/track/[trackingNumber] - Track shipment
  async trackShipment(token: string, trackingNumber: string) {
    const res = await fetch(`${BASE_URL}/commerce/shipping/track/${trackingNumber}`, {
      headers: { ...headers, 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`MarketX tracking fetch failed: ${res.status}`);
    return res.json();
  },
};
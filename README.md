# Tumya — v1

Full stack, run-tested end to end: backend API, customer PWA, and admin dashboard.

## What's built

- **Backend** (`backend/`) — Express + SQLite. Auth, catalog, orders, parcels, payments, push, rates.
- **Customer PWA** (`public/`) — login, catalog browse + cart + checkout (COD cash / QR-scan), parcel
  submission (all 3 handler types), order tracking, order history, push notifications, installable.
- **Admin dashboard** (`admin/`) — served at `/admin`. Order queue with status filters, order detail
  (assign to team member, advance status, reveal QR at handoff, confirm payments), parcel weigh→quote
  flow with auto-suggested pricing, catalog management, pickup points, rate config.

Orange theme generated from your uploaded icon — shared design tokens in `public/css/app.css`, used by
both customer and admin UIs.

## Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` — `JWT_SECRET` needs a real random value (`openssl rand -hex 32`). Payment IDs are already
filled in with your real UPI ID and both mobile money numbers.

```bash
npm run seed    # SAVE the 3 admin passwords printed to console — shown once
npm start
```

- Customer app: `http://localhost:4000/`
- Admin dashboard: `http://localhost:4000/admin/`

Both are served by the same Express process — no separate frontend server, no CORS setup needed.

## What's been actually tested (not just written)

Every flow below was run against a live server with real HTTP requests, not just code-reviewed:

- Full catalog order lifecycle: checkout → QR reveal → payment confirm → status progression, with a
  status-transition guard that rejects invalid states (verified with a real attempted bad transition)
- Full parcel lifecycle: submit (all 3 handler types validated) → admin weighs → price auto-suggested
  from `rate_config` (verified exact math: 4kg × ₹650 = ₹2600, 2.5kg × $10 = $25) → admin confirms/
  overrides quote → customer pays via UPI or momo → admin verifies → auto-advances to confirmed
- Admin order list/detail with customer name+phone joined in, assignment to any of the 3 admins
  (tested assigning to Shirat specifically), full status history log
- Authorization boundaries: customer blocked from admin routes (403), missing token blocked (401)
- Input validation: out-of-stock rejected cleanly (fixed a real bug here — was throwing a raw 500
  before the fix), missing required fields rejected with clear messages, unknown item IDs rejected
- Static file serving for both PWAs confirmed (all JS/CSS/manifest/icons return 200)
- Rate config live-editable and takes effect on the next quote calculation immediately

## Not yet built

- Photo upload endpoint (routes accept a `photo_url` string; needs actual file upload + storage —
  same Cloudinary pattern used elsewhere in your stack)
- OTP for customer login (currently phone-only — fine for a trusted-community launch, listed as a
  known v1 limitation, not an oversight)
- Deployment to your Hetzner box alongside KGC radio (own PM2 process, own Nginx block — planned,
  not yet executed since it needs your server access)

## Known v1 limitation, by design

Customer auth is phone-only, no OTP — anyone entering a known phone number is treated as that
customer. Fine for a trusted-community launch; add OTP before opening this to strangers.


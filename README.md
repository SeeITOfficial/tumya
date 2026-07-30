# Tumya v1

Tumya is an India ↔ Uganda ordering and parcel platform built for individuals, families, and small businesses that regularly send goods between the two countries.

The platform consists of:

- Customer Progressive Web App (PWA)
- Admin Dashboard
- Express REST API
- SQLite database

Everything runs from a single Node.js server.

---

# Features

## Customer PWA

- Passwordless phone login
- Browse product catalog
- Product details with image gallery
- Shopping cart
- Checkout
- Cash on Delivery
- QR payment flow
- Parcel submission
  - Documents
  - Packages
  - Custom items
- Live order tracking
- Order history
- Push notifications
- Installable PWA
- Mobile-first responsive interface

---

## Admin Dashboard

- Secure admin login
- Dashboard
- View all orders
- Filter by status
- View complete order details
- Assign orders to staff
- Status progression
- QR payment verification
- Parcel quotation
- Automatic rate calculation
- Manual quote override
- Pickup point management
- Catalog management
- Product availability management
- Shipping rate configuration

---

## Backend

- Express.js
- SQLite
- JWT Authentication
- REST API
- Password hashing
- Push notifications
- Order lifecycle engine
- Payment verification workflow
- Image upload support
- Email notifications
- Validation
- Transaction support
- Status history
- Tracking code generation

---

# Technology Stack

## Backend

- Node.js
- Express
- SQLite
- JWT
- bcrypt
- Sharp
- Web Push
- Nodemailer / Resend

## Frontend

- Vanilla JavaScript
- HTML5
- CSS3
- Progressive Web App

---

# Project Structure

```
backend/
│
├── db/
├── lib/
├── routes/
├── uploads/
├── public/
│   ├── css/
│   ├── js/
│   ├── icons/
│   ├── manifest.webmanifest
│   └── sw.js
│
├── admin/
├── server.js
├── package.json
└── README.md
```

---

# Installation

Clone the repository.

```
git clone <repository-url>
cd backend
```

Install dependencies.

```
npm install
```

Create the environment file.

```
cp .env.example .env
```

Generate a secure JWT secret.

```
openssl rand -hex 32
```

Paste it into

```
JWT_SECRET=
```

Configure the remaining environment variables.

Seed the database.

```
npm run seed
```

**Important**

The seed command prints the initial administrator passwords **once**.

Save them.

Start the server.

```
npm start
```

---

# Development URLs

Customer

```
http://localhost:4000/
```

Admin

```
http://localhost:4000/admin/
```

---

# Production Deployment

Recommended stack

- Ubuntu
- Node.js LTS
- PM2
- Nginx
- HTTPS (Let's Encrypt)

Typical deployment

```
git pull
npm install
npm run seed    # first deployment only
pm2 start server.js --name tumya
pm2 save
```

Configure Nginx to proxy traffic to the Express server.

Enable HTTPS.

---

# Environment Variables

Required

```
JWT_SECRET=

PORT=

RESEND_API_KEY=

EMAIL_FROM=

UPI_ID=

UGANDA_MTN_NUMBER=

UGANDA_AIRTEL_NUMBER=
```

Additional variables may be configured depending on deployment.

---

# Order Flow

Customer

```
Browse Products
↓

Cart
↓

Checkout
↓

Payment Method
↓

Order Created
↓

Admin Confirms Payment
↓

Confirmed
↓

Purchased
↓

In Transit
↓

Arrived
↓

Ready for Pickup
↓

Completed
```

---

# Parcel Flow

Customer

```
Submit Parcel
↓

Admin Weighs Parcel
↓

Automatic Quote
↓

Customer Payment
↓

Payment Verification
↓

Confirmed
↓

Shipment Progress
↓

Completed
```

---

# Payment Methods

Supported

- Cash on Delivery
- QR Payment
- UPI
- MTN Mobile Money
- Airtel Money

---

# Notifications

Customers receive notifications for:

- Order placed
- Quote ready
- Payment verified
- Confirmed
- Purchased
- In Transit
- Arrived
- Ready for Pickup
- Completed

Notifications are delivered through:

- Push Notifications
- Email

---

# Security

Implemented

- JWT Authentication
- Password hashing
- SQL parameterized queries
- Input validation
- Image validation
- Upload sanitization
- Transaction-safe database operations
- Protected admin routes
- Customer/admin authorization separation
- Secure tracking codes

---

# Tested

The following workflows have been fully tested end-to-end.

### Catalog Orders

- Product browsing
- Cart
- Checkout
- QR payment
- Cash payment
- Payment confirmation
- Status progression
- Tracking
- Completion

### Parcels

- All three parcel types
- Weight calculation
- Automatic pricing
- Manual pricing
- Quote approval
- Payment verification
- Shipment lifecycle

### Admin

- Login
- Order assignment
- Status updates
- Payment verification
- Catalog CRUD
- Pickup point CRUD
- Shipping rate configuration

### Validation

Verified

- Unauthorized requests
- Missing authentication
- Invalid order transitions
- Invalid product IDs
- Out of stock protection
- Missing required fields
- Static asset serving
- Database transactions

---

# Progressive Web App

Supports

- Installable
- Offline application shell
- Push notifications
- Mobile-first experience
- Standalone mode
- Theme integration

---

# Known Limitations

Current v1 intentionally ships with:

- Phone-only customer authentication (no OTP)
- SQLite database
- Single-server deployment

OTP authentication should be enabled before opening the platform to the general public.

---

# Roadmap

Planned future improvements

- OTP authentication
- Cloud image storage
- Payment gateway integration
- Customer profile management
- Order search
- Coupons
- Multiple currencies
- Analytics dashboard
- Multi-country expansion
- PostgreSQL support
- Multi-language support
- Staff roles & permissions
- Delivery scheduling

---

# License

Private project.

Copyright © Tumya.
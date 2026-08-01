require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
const { webhooksRouter } = require('./routes/webhooks');
const { startJobs } = require('./lib/jobs');

const app = express();

app.disable("x-powered-by");

// ---------------------------------------------------------------------------
// CORS — lock to our own domain; override via CORS_ORIGIN in .env for local dev
// ---------------------------------------------------------------------------
app.use(cors({
  origin: process.env.CORS_ORIGIN || "https://tumya.app",
  credentials: true,
}));

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------

/** Shared JSON error handler so the frontend toast picks it up correctly. */
const rateLimitHandler = (req, res) => {
  res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
};

/** General auth limiter — 5 requests per 15 minutes per IP */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: (req) => req.originalUrl.includes('/admin/login'),
});

/** Admin login limiter — 20 requests per 15 minutes per IP */
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/** Tighter limiter for the resend-code endpoint — 3 per 15 min per IP */
const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

app.use(express.json({ limit: "5mb" }));

// API Routes
app.use("/api/auth/resend-code", resendLimiter);
app.use("/api/auth/admin/login", adminLimiter);
app.use("/api/auth", authLimiter);

// API Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/catalog", require("./routes/catalog"));
app.use("/api/pickup-points", require("./routes/pickupPoints"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/parcels", require("./routes/parcels"));
app.use("/api/push", require("./routes/push"));
app.use("/api/notifications", require("./routes/notifications"));

// Static Assets
app.use(
  "/uploads",
  express.static(path.join(__dirname, "public", "uploads"))
);

app.use(
  "/images",
  express.static(path.join(__dirname, "public", "images"))
);

// Health Check
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
  });
});

// Frontend
app.use(
  "/admin",
  express.static(path.join(__dirname, "..", "admin"))
);

app.use(
  express.static(path.join(__dirname, "..", "public"))
);

// Admin SPA
app.get("/admin", (req, res) => {
  res.sendFile(
    path.join(__dirname, "..", "admin", "index.html")
  );
});

// Customer SPA
app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "..", "public", "index.html")
  );
});

// 404
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    error: "Internal server error",
  });
});

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`Tumya API listening on port ${PORT}`);
  startJobs();
});

function shutdown(signal) {
  console.log(`${signal} received — shutting down gracefully`);
  server.close((err) => {
    if (err) {
      console.error("Error during shutdown:", err);
      process.exit(1);
    }
    console.log("HTTP server closed");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.disable("x-powered-by");

app.use(cors());
app.use(express.json({ limit: "5mb" }));

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

app.listen(PORT, () => {
  console.log(`Tumya API listening on port ${PORT}`);
});
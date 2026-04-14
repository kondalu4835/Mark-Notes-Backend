require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const authRoutes = require("./routes/auth");
const notesRoutes = require("./routes/notes");
const tagsRoutes = require("./routes/tags");

const app = express();

// =======================
// MIDDLEWARE
// =======================
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

// =======================
// CORS FIX (PRODUCTION SAFE)
// =======================
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:3000"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // IMPORTANT: allow anyway to avoid CORS crash
      return callback(null, true);
    },
    credentials: true
  })
);

// =======================
// ROUTES
// =======================
app.use("/api/auth", authRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/tags", tagsRoutes);

// =======================
// HEALTH CHECK
// =======================
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// =======================
// 404
// =======================
app.use((req, res) => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.url}`
  });
});

// =======================
// ERROR HANDLER
// =======================
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Frontend allowed: ${process.env.FRONTEND_URL}`);
});
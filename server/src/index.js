import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import templateRoutes from "./routes/templateRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import cardRoutes from "./routes/cardRoutes.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5000);

// Define allowed origins
const defaultOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://idcardphoto.vercel.app", // Your Vercel frontend
];

const clientOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map((url) => url.trim())
  : defaultOrigins;

// Ensure Vercel URL is always included
if (!clientOrigins.includes("https://idcardphoto.vercel.app")) {
  clientOrigins.push("https://idcardphoto.vercel.app");
}

console.log("CORS allowed origins:", clientOrigins);

app.use(
  cors({
    origin: clientOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "idcard-server" }));
app.use("/api/auth", authRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/cards", cardRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  return res.status(500).json({ message: err.message || "Internal server error" });
});

const start = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
};

start();

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

const clientOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((url) => url.trim());

app.use(
  cors({
    origin: clientOrigins,
    credentials: true,
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

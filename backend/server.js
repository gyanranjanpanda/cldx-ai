// Must be first — patches Node.js globals for LangChain/LangGraph
import "./services/agent/utils/polyfill.js";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

dotenv.config();

// ─── DB Connect ──────────────────────────────────────────────────────────────
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB Error:", err.message);
  }
};

// ─── App Setup ───────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 8000;
const IS_PROD = process.env.NODE_ENV === "production";

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://frontend-neon-five-69.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    // allow all vercel.app subdomains for preview deployments
    if (origin.endsWith(".vercel.app")) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
}));
app.use(morgan("dev"));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));

// ─── Static Uploads ──────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ─── Remove CSP for agent preview routes ─────────────────────────────────────
app.use("/api/agent/preview", (req, res, next) => {
  res.removeHeader("Content-Security-Policy");
  res.removeHeader("X-Frame-Options");
  res.removeHeader("Cross-Origin-Resource-Policy");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});

// ─── Auth Middleware (from gateway) ─────────────────────────────────────────
import redis from "./shared/redis/redis.js";

const protect = async (req, res, next) => {
  try {
    const sessionId = req?.cookies?.session;
    if (!sessionId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const session = await redis.get(`session:${sessionId}`);
    if (!session) {
      return res.status(401).json({ message: "Session Expired" });
    }
    req.user = JSON.parse(session);
    next();
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── Routes ──────────────────────────────────────────────────────────────────
import authRouter from "./services/auth/routes/auth.routes.js";
import chatRouter from "./services/chat/routes/chat.routes.js";
import agentRouter from "./services/agent/routes/agent.route.js";
import billingRouter from "./services/billing/routes/billing.routes.js";
import { getCurrentUser } from "./gateway/controllers/user.controller.js";

app.use("/api/auth", authRouter);
app.get("/api/me", protect, getCurrentUser);
app.use("/api/chat", protect, chatRouter);
app.use("/api/agent", protect, agentRouter);
app.use("/api/billing", protect, billingRouter);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ service: "cldx-ai backend", status: "ok", env: IS_PROD ? "production" : "development" });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  if (err.status) {
    return res.status(err.status).json(err.data || { success: false, message: err.message });
  }
  return res.status(500).json({ success: false, message: err.message || "Internal Server Error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 cldx.ai unified server running on port ${PORT}`);
  });
});

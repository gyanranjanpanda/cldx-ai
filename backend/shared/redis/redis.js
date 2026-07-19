import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();

// ─── In-Memory Fallback ───────────────────────────────────────────────────────
// Used when REDIS_URL is not set (e.g. local dev without Redis or Render free tier).
// Sessions are stored in process memory — lost on restart but fully functional.
class MemoryStore {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value, exFlag, seconds) {
    const expiresAt = exFlag && seconds ? Date.now() + seconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async del(key) {
    this.store.delete(key);
    return 1;
  }

  on(event, cb) {
    if (event === "connect") cb();
    return this;
  }
}

let redis;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL);
  redis.on("connect", () => console.log("✅ Redis Connected"));
  redis.on("error", (err) => console.error("Redis error:", err.message));
} else {
  console.warn("⚠️  REDIS_URL not set — using in-memory session store");
  redis = new MemoryStore();
}

export default redis;
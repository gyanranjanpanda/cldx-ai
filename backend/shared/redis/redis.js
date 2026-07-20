import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();

// ─── In-Memory Fallback ───────────────────────────────────────────────────────
// Used when REDIS_URL is not set (e.g. local dev without Redis or Render/Railway free tier).
// Stores sessions and rate limits in process memory — fully compatible with ioredis.
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

  async incr(key) {
    const entry = this.store.get(key);
    let val = 0;
    if (entry && (!entry.expiresAt || Date.now() < entry.expiresAt)) {
      val = parseInt(entry.value, 10) || 0;
    }
    val += 1;
    this.store.set(key, { value: String(val), expiresAt: entry?.expiresAt || null });
    return val;
  }

  async expire(key, seconds) {
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    this.store.set(key, entry);
    return 1;
  }

  async ttl(key) {
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (entry.expiresAt) {
      const remaining = Math.round((entry.expiresAt - Date.now()) / 1000);
      return remaining > 0 ? remaining : -2;
    }
    return -1;
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
  console.warn("⚠️  REDIS_URL not set — using in-memory session/rate-limit store");
  redis = new MemoryStore();
}

export default redis;
import { Redis } from "ioredis";
import { config } from "../config/index.js";

/**
 * Shared Redis connection (OTP, JWT denylist, rate limits).
 * `lazyConnect` keeps the API bootable when Redis is down; commands then fail
 * and the caller decides (auth fails closed, /health reports it).
 */
export const redis = new Redis(config.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false,
});

redis.on("error", (error: Error) => {
  console.error(`[redis] ${error.message}`);
});

/** Open the lazy connection on demand (boot, tests, and every helper below). */
export async function ensureRedis(): Promise<void> {
  if (redis.status === "wait") {
    await redis.connect();
  }
}

/** Open the connection eagerly (called once from server.ts). */
export async function connectRedis(): Promise<void> {
  await ensureRedis();
}

/** `true` when Redis answers PING; used by GET /health. */
export async function pingRedis(): Promise<boolean> {
  try {
    await ensureRedis();
    return (await redis.ping()) === "PONG";
  } catch (error) {
    console.error(`[redis] ping failed: ${(error as Error).message}`);
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  try {
    if (redis.status === "ready" || redis.status === "connecting" || redis.status === "connect") {
      await redis.quit();
    } else {
      redis.disconnect();
    }
  } catch {
    redis.disconnect();
  }
}

import type { Request, RequestHandler } from "express";
import { config } from "../config/index.js";
import { ensureRedis, redis } from "../lib/redis.js";
import { AppError } from "../utils/AppError.js";

export interface RateLimitOptions {
  /** Namespace in Redis, e.g. `auth:login`. */
  name: string;
  max: number;
  windowSeconds: number;
  /** Extra identity part (e.g. the submitted email) appended to the client IP. */
  identity?: (req: Request) => string | undefined;
}

export const RATE_LIMIT_KEY_PREFIX = "rl:";

/**
 * Fixed-window limiter backed by Redis (D6). Every auth path is limited, so the
 * limiter fails closed (`503`) when Redis is down: without it the endpoints
 * would be open to unlimited guessing.
 */
export const rateLimiter = (options: RateLimitOptions): RequestHandler => async (req, res, next) => {
  // Tests disable the limiter so a scripted run never hits the production limits.
  if (config.rateLimitDisabled) {
    next();
    return;
  }

  const clientIp = req.ip ?? "unknown";
  const extra = options.identity?.(req)?.trim().toLowerCase();
  const identity = extra ? `${clientIp}:${extra}` : clientIp;
  const windowIndex = Math.floor(Date.now() / 1000 / options.windowSeconds);
  const key = `${RATE_LIMIT_KEY_PREFIX}${options.name}:${identity}:${windowIndex}`;

  try {
    await ensureRedis();

    const hits = await redis.incr(key);

    if (hits === 1) {
      await redis.expire(key, options.windowSeconds);
    }

    if (hits > options.max) {
      const ttl = await redis.ttl(key);
      const retryAfterSeconds = ttl > 0 ? ttl : options.windowSeconds;

      res.setHeader("Retry-After", String(retryAfterSeconds));

      throw new AppError(429, "Too many requests. Please wait and try again.", "RATE_LIMITED", [
        { retryAfterSeconds },
      ]);
    }

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    console.error(`[rate-limit] redis error: ${(error as Error).message}`);
    next(
      AppError.serviceUnavailable(
        "This action is temporarily unavailable. Please try again in a moment.",
        "DEPENDENCY_UNAVAILABLE",
      ),
    );
  }
};

/** Reads a string field from a JSON body without assuming its shape. */
export const emailIdentity = (req: Request): string | undefined => {
  const body = req.body as unknown;

  if (typeof body !== "object" || body === null) return undefined;

  const email = (body as Record<string, unknown>).email;

  return typeof email === "string" ? email : undefined;
};

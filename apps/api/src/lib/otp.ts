import { AppError } from "../utils/AppError.js";
import { generateOtp, hashToken, safeEqual } from "./hash.js";
import { ensureRedis, redis } from "./redis.js";

/** D7: two kinds of one-time codes, same policy. */
export type OtpPurpose = "verify-email" | "reset-password";

const NAMESPACES: Record<OtpPurpose, string> = {
  "verify-email": "verify:email",
  "reset-password": "reset:pwd",
};

export const OTP_TTL_SECONDS = 15 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

interface OtpKeys {
  code: string;
  attempts: string;
  cooldown: string;
}

const keysFor = (purpose: OtpPurpose, userId: string): OtpKeys => {
  const namespace = NAMESPACES[purpose];

  return {
    code: `${namespace}:${userId}`,
    attempts: `${namespace}:attempts:${userId}`,
    cooldown: `${namespace}:cooldown:${userId}`,
  };
};

/** Redis is part of the auth path, so an outage fails closed with a 503. */
const redisUnavailable = (purpose: OtpPurpose, error: unknown): AppError => {
  console.error(`[otp] redis error (${purpose}): ${(error as Error).message}`);

  return AppError.serviceUnavailable(
    "Verification is temporarily unavailable. Please try again in a moment.",
    "DEPENDENCY_UNAVAILABLE",
  );
};

/** Seconds left before another code may be requested (0 = allowed now). */
export async function secondsUntilResend(purpose: OtpPurpose, userId: string): Promise<number> {
  const { cooldown } = keysFor(purpose, userId);

  try {
    await ensureRedis();
    const ttl = await redis.ttl(cooldown);

    return ttl > 0 ? ttl : 0;
  } catch (error) {
    throw redisUnavailable(purpose, error);
  }
}

/**
 * Creates a fresh 6-digit code, stores ONLY its SHA-256 hash (15 min TTL), resets
 * the attempt counter and starts the 60 s resend cooldown.
 * Returns the plain code so the caller can email it; never log the result.
 */
export async function issueOtp(purpose: OtpPurpose, userId: string): Promise<string> {
  const waitSeconds = await secondsUntilResend(purpose, userId);

  if (waitSeconds > 0) {
    throw new AppError(
      429,
      `Please wait ${waitSeconds} seconds before requesting another code`,
      "OTP_COOLDOWN",
      [{ retryAfterSeconds: waitSeconds }],
    );
  }

  const code = generateOtp();
  const keys = keysFor(purpose, userId);

  try {
    await ensureRedis();
    await redis
      .multi()
      .set(keys.code, hashToken(code), "EX", OTP_TTL_SECONDS)
      .del(keys.attempts)
      .set(keys.cooldown, "1", "EX", OTP_RESEND_COOLDOWN_SECONDS)
      .exec();
  } catch (error) {
    throw redisUnavailable(purpose, error);
  }

  return code;
}

/**
 * Constant-time check of a submitted code.
 * - unknown/expired code → `400 OTP_EXPIRED`
 * - wrong code          → `400 INVALID_OTP` with the attempts left
 * - 5th wrong attempt   → code is destroyed, `429 OTP_LOCKED`
 */
export async function verifyOtp(purpose: OtpPurpose, userId: string, submittedCode: string): Promise<void> {
  const keys = keysFor(purpose, userId);
  let storedHash: string | null;

  try {
    await ensureRedis();
    storedHash = await redis.get(keys.code);
  } catch (error) {
    throw redisUnavailable(purpose, error);
  }

  if (!storedHash) {
    throw new AppError(400, "This code is invalid or has expired. Request a new one.", "OTP_EXPIRED");
  }

  if (safeEqual(storedHash, hashToken(submittedCode))) {
    await clearOtp(purpose, userId);
    return;
  }

  let attempts: number;

  try {
    attempts = await redis.incr(keys.attempts);

    if (attempts === 1) {
      await redis.expire(keys.attempts, OTP_TTL_SECONDS);
    }
  } catch (error) {
    throw redisUnavailable(purpose, error);
  }

  if (attempts >= OTP_MAX_ATTEMPTS) {
    await clearOtp(purpose, userId);
    throw new AppError(429, "Too many incorrect attempts. Request a new code.", "OTP_LOCKED");
  }

  throw new AppError(
    400,
    `Incorrect code. ${OTP_MAX_ATTEMPTS - attempts} attempt(s) left.`,
    "INVALID_OTP",
    [{ attemptsLeft: OTP_MAX_ATTEMPTS - attempts }],
  );
}

/** Removes the code, the attempt counter and the cooldown (best effort). */
export async function clearOtp(purpose: OtpPurpose, userId: string): Promise<void> {
  const keys = keysFor(purpose, userId);

  try {
    await ensureRedis();
    await redis.del(keys.code, keys.attempts, keys.cooldown);
  } catch (error) {
    // The code has already served its purpose; a failed cleanup must not break the flow.
    console.error(`[otp] cleanup failed (${purpose}): ${(error as Error).message}`);
  }
}

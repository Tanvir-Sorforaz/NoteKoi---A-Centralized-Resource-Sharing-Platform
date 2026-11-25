import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

/** bcrypt cost. 12 keeps login under ~250 ms on the target hardware. */
const BCRYPT_ROUNDS = 12;

export const hashPassword = (plainPassword: string): Promise<string> => bcrypt.hash(plainPassword, BCRYPT_ROUNDS);

export const verifyPassword = (plainPassword: string, passwordHash: string): Promise<boolean> =>
  bcrypt.compare(plainPassword, passwordHash);

/** 6-digit numeric OTP (D7). Crypto-strong, zero-padded. */
export const generateOtp = (): string => randomInt(0, 1_000_000).toString().padStart(6, "0");

/** SHA-256 hex. Used for OTP codes so Redis never holds a usable code. */
export const hashToken = (value: string): string => createHash("sha256").update(value).digest("hex");

/** Length-safe constant-time comparison for two hex digests. */
export const safeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) return false;

  return timingSafeEqual(leftBuffer, rightBuffer);
};

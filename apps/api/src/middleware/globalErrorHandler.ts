import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { config } from "../config/index.js";
import { AppError } from "../utils/AppError.js";

interface PrismaKnownError {
  name: string;
  code: string;
  meta?: Record<string, unknown>;
  message: string;
}

const isPrismaKnownError = (error: unknown): error is PrismaKnownError => {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return candidate.name === "PrismaClientKnownRequestError" && typeof candidate.code === "string";
};

const PRISMA_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  P2000: { status: 400, code: "VALUE_TOO_LONG", message: "A provided value is too long." },
  P2002: { status: 409, code: "DUPLICATE", message: "A record with these unique values already exists." },
  P2003: {
    status: 409,
    code: "FOREIGN_KEY_VIOLATION",
    message: "A referenced record does not exist, or is still referenced.",
  },
  P2011: { status: 400, code: "NULL_CONSTRAINT", message: "A required value is missing." },
  P2014: { status: 409, code: "RELATION_VIOLATION", message: "The change would break a required relation." },
  P2025: { status: 404, code: "NOT_FOUND", message: "The requested record does not exist." },
};

const isBodyParserSyntaxError = (error: unknown): boolean =>
  error instanceof SyntaxError && "body" in (error as unknown as Record<string, unknown>);

/** Last middleware in the chain: renders every error in the D-format shape. */
export const globalErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      code: error.code ?? "APP_ERROR",
      errors: error.errors ?? [],
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      errors: error.issues.map((issue) => ({
        path: issue.path.map((part) => String(part)).join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (isBodyParserSyntaxError(error)) {
    res.status(400).json({
      success: false,
      message: "Request body is not valid JSON",
      code: "INVALID_JSON",
      errors: [],
    });
    return;
  }

  if (isPrismaKnownError(error)) {
    const mapped = PRISMA_ERRORS[error.code];
    if (mapped) {
      res.status(mapped.status).json({
        success: false,
        message: mapped.message,
        code: mapped.code,
        errors: config.isProduction ? [] : [{ prismaCode: error.code, meta: error.meta }],
      });
      return;
    }
  }

  console.error(`[error] ${req.method} ${req.originalUrl}\n${(error as Error)?.stack ?? String(error)}`);

  res.status(500).json({
    success: false,
    message: config.isProduction ? "Internal server error" : ((error as Error)?.message ?? "Internal server error"),
    code: "INTERNAL_ERROR",
    errors: [],
  });
};

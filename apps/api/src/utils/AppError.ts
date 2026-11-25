/**
 * Operational (expected) error. Throw it anywhere; the global error handler
 * turns it into `{ success: false, message, code, errors }`.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly errors?: unknown[];
  readonly isOperational = true;

  constructor(statusCode: number, message: string, code?: string, errors?: unknown[]) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    Error.captureStackTrace(this, AppError);
  }

  static badRequest(message = "Bad request", code?: string, errors?: unknown[]): AppError {
    return new AppError(400, message, code, errors);
  }

  static unauthorized(message = "Unauthorized", code?: string): AppError {
    return new AppError(401, message, code);
  }

  static forbidden(message = "Forbidden", code?: string): AppError {
    return new AppError(403, message, code);
  }

  static notFound(message = "Not found", code?: string): AppError {
    return new AppError(404, message, code);
  }

  static conflict(message = "Conflict", code?: string): AppError {
    return new AppError(409, message, code);
  }

  static serviceUnavailable(message = "Service unavailable", code?: string): AppError {
    return new AppError(503, message, code);
  }
}

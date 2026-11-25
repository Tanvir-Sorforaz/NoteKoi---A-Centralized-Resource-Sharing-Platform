import type { Response } from "express";

export interface SendResponseOptions<T> {
  message: string;
  data?: T;
  statusCode?: number;
  meta?: Record<string, unknown>;
}

/**
 * Every successful response has the shape
 * `{ success: true, message, data, meta }`.
 */
export const sendResponse = <T>(res: Response, options: SendResponseOptions<T>): Response => {
  const { message, data, statusCode = 200, meta = {} } = options;

  return res.status(statusCode).json({
    success: true,
    message,
    data: data ?? null,
    meta,
  });
};

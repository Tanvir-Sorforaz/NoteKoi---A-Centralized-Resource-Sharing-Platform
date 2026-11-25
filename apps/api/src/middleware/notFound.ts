import type { RequestHandler } from "express";
import { AppError } from "../utils/AppError.js";

/** Reached only when no route matched. */
export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Route ${req.method} ${req.originalUrl} not found`, "ROUTE_NOT_FOUND"));
};

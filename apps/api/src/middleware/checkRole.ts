import type { RequestHandler } from "express";
import type { UserRoleType } from "../../generated/prisma/enums.js";
import { hasRole } from "../lib/authz.js";
import { AppError } from "../utils/AppError.js";
import { requireAuth } from "./checkAuth.js";

/**
 * S1-B6 — requires at least one of the listed active roles.
 * A Platform Admin passes every check (A.4); run it after `checkAuth`.
 */
export const checkRole =
  (...wanted: UserRoleType[]): RequestHandler =>
  (req, _res, next) => {
    try {
      const auth = requireAuth(req);

      if (!hasRole(auth.roles, ...wanted)) {
        throw AppError.forbidden("Your role does not allow this action", "FORBIDDEN_ROLE");
      }

      next();
    } catch (error) {
      next(error);
    }
  };

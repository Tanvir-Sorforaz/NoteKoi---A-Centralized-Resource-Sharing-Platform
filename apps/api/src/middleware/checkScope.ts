import type { Request, RequestHandler } from "express";
import type { AuthRole } from "../lib/authz.js";
import { AppError } from "../utils/AppError.js";
import { requireAuth } from "./checkAuth.js";

export type ScopeDimension = "COLLEGE" | "DEPARTMENT" | "SESSION";
export type ScopeSource = "params" | "body" | "query";

export interface ScopeIds {
  collegeId?: string;
  departmentId?: string;
  sessionId?: string;
}

/**
 * S1-B6 — scope matching without a DB round-trip.
 * - a PLATFORM role covers everything
 * - a COLLEGE role covers anything inside that college
 * - a DEPARTMENT_SESSION role covers its own department (and its own session
 *   when a session id is part of the request)
 */
export const roleCoversScope = (role: AuthRole, dimension: ScopeDimension, ids: ScopeIds): boolean => {
  if (role.scope === "PLATFORM") return role.role === "PLATFORM_ADMIN";

  if (role.scope === "COLLEGE") {
    return Boolean(ids.collegeId) && role.collegeId === ids.collegeId;
  }

  // DEPARTMENT_SESSION (CR / Co-CR)
  if (dimension === "COLLEGE") return false;
  if (dimension === "DEPARTMENT" && !ids.departmentId) return false;
  if (dimension === "SESSION" && !ids.sessionId) return false;
  if (ids.departmentId && role.departmentId !== ids.departmentId) return false;
  if (ids.sessionId && role.sessionId !== ids.sessionId) return false;

  return true;
};

const readId = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const scopeIdsFrom = (req: Request, source: ScopeSource): ScopeIds => {
  const container: unknown =
    source === "params" ? req.params : source === "query" ? req.query : (req.body as unknown);

  const record = (typeof container === "object" && container !== null ? container : {}) as Record<string, unknown>;

  return {
    collegeId: readId(record.collegeId),
    departmentId: readId(record.departmentId),
    sessionId: readId(record.sessionId),
  };
};

/**
 * S1-B6 — 403 unless one active role covers the ids found in the request
 * (`collegeId` / `departmentId` / `sessionId`). Used by S2 onward.
 */
export const checkScope =
  (dimension: ScopeDimension, source: ScopeSource = "params"): RequestHandler =>
  (req, _res, next) => {
    try {
      const auth = requireAuth(req);
      const ids = scopeIdsFrom(req, source);

      if (dimension === "COLLEGE" && !ids.collegeId) {
        throw AppError.badRequest("collegeId is required for this request", "SCOPE_ID_MISSING");
      }

      if (dimension === "DEPARTMENT" && !ids.departmentId) {
        throw AppError.badRequest("departmentId is required for this request", "SCOPE_ID_MISSING");
      }

      if (dimension === "SESSION" && !ids.sessionId) {
        throw AppError.badRequest("sessionId is required for this request", "SCOPE_ID_MISSING");
      }

      if (!auth.roles.some((role) => roleCoversScope(role, dimension, ids))) {
        throw AppError.forbidden("This action is outside your scope", "FORBIDDEN_SCOPE");
      }

      next();
    } catch (error) {
      next(error);
    }
  };

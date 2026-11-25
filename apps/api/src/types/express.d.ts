import type { AuthRole, AuthUser } from "./authz.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by `checkAuth`; read it through `requireAuth(req)` inside controllers. */
      auth?: AuthUser;
      /** Extra fields some modules attach for audit logging. */
      authRole?: AuthRole;
    }
  }
}

export {};

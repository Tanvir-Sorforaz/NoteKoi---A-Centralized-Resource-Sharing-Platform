import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth.js";
import { emailIdentity, rateLimiter } from "../../middleware/rateLimiter.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import * as controller from "./auth.controller.js";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "./auth.validation.js";

/** Mounted by routes/index.ts at `/api/v1/auth`. */
export const authRouter = Router();

authRouter.post(
  "/register",
  rateLimiter({ name: "auth:register", max: 10, windowSeconds: 60 * 60 }),
  validateRequest({ body: registerSchema }),
  controller.register,
);

authRouter.post(
  "/verify-email",
  rateLimiter({ name: "auth:verify-email", max: 10, windowSeconds: 15 * 60, identity: emailIdentity }),
  validateRequest({ body: verifyEmailSchema }),
  controller.verifyEmail,
);

authRouter.post(
  "/resend-verification",
  rateLimiter({ name: "auth:resend-verification", max: 3, windowSeconds: 15 * 60, identity: emailIdentity }),
  validateRequest({ body: resendVerificationSchema }),
  controller.resendVerification,
);

authRouter.post(
  "/login",
  rateLimiter({ name: "auth:login", max: 10, windowSeconds: 15 * 60, identity: emailIdentity }),
  validateRequest({ body: loginSchema }),
  controller.login,
);

authRouter.post("/logout", checkAuth, controller.logout);

authRouter.post(
  "/forgot-password",
  rateLimiter({ name: "auth:forgot-password", max: 5, windowSeconds: 60 * 60, identity: emailIdentity }),
  validateRequest({ body: forgotPasswordSchema }),
  controller.forgotPassword,
);

authRouter.post(
  "/reset-password",
  rateLimiter({ name: "auth:reset-password", max: 10, windowSeconds: 15 * 60, identity: emailIdentity }),
  validateRequest({ body: resetPasswordSchema }),
  controller.resetPassword,
);

authRouter.get("/me", checkAuth, controller.me);

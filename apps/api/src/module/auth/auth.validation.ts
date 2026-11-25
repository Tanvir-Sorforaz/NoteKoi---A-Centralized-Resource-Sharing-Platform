import { z } from "zod";

const trimmedText = (label: string, min: number, max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z
      .string(`${label} is required`)
      .min(min, `${label} must be at least ${min} characters`)
      .max(max, `${label} must be at most ${max} characters`),
  );

/** Emails are stored lower-case so `Alice@x.com` and `alice@x.com` are one account. */
export const emailSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z.email("Enter a valid email address").max(254, "Email is too long"),
);

export const passwordSchema = z
  .string("Password is required")
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const otpCodeSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string("Enter the 6-digit code").regex(/^\d{6}$/, "The code is 6 digits"),
);

const uuidSchema = (label: string) => z.uuid(`Select a valid ${label}`);

const studentRegisterSchema = z.object({
  role: z.literal("STUDENT"),
  name: trimmedText("Name", 2, 100),
  email: emailSchema,
  password: passwordSchema,
  collegeId: uuidSchema("college"),
  departmentId: uuidSchema("department"),
  sessionId: uuidSchema("session"),
  regNo: trimmedText("Registration number", 1, 50),
});

const teacherRegisterSchema = z.object({
  role: z.literal("TEACHER"),
  name: trimmedText("Name", 2, 100),
  email: emailSchema,
  password: passwordSchema,
  collegeId: uuidSchema("college"),
  departmentIds: z
    .array(uuidSchema("department"), "Select at least one department")
    .min(1, "Select at least one department")
    .max(10, "Select at most 10 departments")
    .refine((ids) => new Set(ids).size === ids.length, "Each department may be selected only once"),
});

export const registerSchema = z.discriminatedUnion("role", [studentRegisterSchema, teacherRegisterSchema]);

export const verifyEmailSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
});

export const resendVerificationSchema = z.object({
  email: emailSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string("Password is required").min(1, "Password is required").max(72),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
  newPassword: passwordSchema,
});

export type RegisterSchemaInput = z.infer<typeof registerSchema>;
export type LoginSchemaInput = z.infer<typeof loginSchema>;
export type VerifyEmailSchemaInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationSchemaInput = z.infer<typeof resendVerificationSchema>;
export type ForgotPasswordSchemaInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordSchemaInput = z.infer<typeof resetPasswordSchema>;

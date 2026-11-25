import { z } from "zod";

/**
 * Client-side mirrors of `apps/api/src/module/auth/auth.validation.ts`.
 * The backend stays the authority; these only give instant feedback (7C rule 4).
 */
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

const nameField = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name must be at most 100 characters");

const codeField = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "The code is 6 digits");

export const studentRegisterSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
  collegeId: z.string().min(1, "Select a college"),
  departmentId: z.string().min(1, "Select a department"),
  sessionId: z.string().min(1, "Select a session"),
  regNo: z.string().trim().min(1, "Enter your registration number").max(50, "Too long"),
});

export const teacherRegisterSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
  collegeId: z.string().min(1, "Select a college"),
  departmentIds: z.array(z.string().min(1)).min(1, "Select at least one department"),
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password"),
});

export const verifyEmailSchema = z.object({
  email: emailField,
  code: codeField,
});

export const resendVerificationSchema = z.object({ email: emailField });

export const forgotPasswordSchema = z.object({ email: emailField });

export const resetPasswordSchema = z.object({
  email: emailField,
  code: codeField,
  newPassword: passwordField,
});

export type StudentRegisterValues = z.infer<typeof studentRegisterSchema>;
export type TeacherRegisterValues = z.infer<typeof teacherRegisterSchema>;
export type LoginValues = z.infer<typeof loginSchema>;
export type VerifyEmailValues = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

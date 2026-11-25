import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config/index.js";
import { AppError } from "../utils/AppError.js";
import { OTP_TTL_SECONDS } from "./otp.js";

export type OtpEmailPurpose = "verify-email" | "reset-password";

export interface OtpEmailInput {
  to: string;
  name: string;
  code: string;
  purpose: OtpEmailPurpose;
}

let transporter: Transporter | null = null;

const getTransporter = (): Transporter => {
  if (!config.smtp.isConfigured) {
    throw new AppError(503, "Email delivery is not configured on this server", "MAIL_NOT_CONFIGURED");
  }

  transporter ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });

  return transporter;
};

const subjectFor = (purpose: OtpEmailPurpose): string =>
  purpose === "verify-email" ? "Your NoteKoi verification code" : "Reset your NoteKoi password";

const expiryMinutes = Math.round(OTP_TTL_SECONDS / 60);

const introFor = (input: OtpEmailInput): string =>
  input.purpose === "verify-email"
    ? `Hi ${input.name}, use the code below to verify your NoteKoi email address.`
    : `Hi ${input.name}, use the code below to choose a new NoteKoi password.`;

const textFor = (input: OtpEmailInput): string =>
  [
    introFor(input),
    "",
    `Code: ${input.code}`,
    "",
    `The code expires in ${expiryMinutes} minutes. If you did not request it, you can ignore this email.`,
    "",
    "— NoteKoi",
  ].join("\n");

const htmlFor = (input: OtpEmailInput): string => `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111827">
    <h2 style="margin:0 0 16px;font-size:20px">NoteKoi</h2>
    <p style="margin:0 0 16px;line-height:1.5">${introFor(input)}</p>
    <p style="margin:0 0 16px;font-size:32px;letter-spacing:8px;font-weight:700;font-family:ui-monospace,SFMono-Regular,monospace">${input.code}</p>
    <p style="margin:0 0 16px;line-height:1.5;color:#4b5563">The code expires in ${expiryMinutes} minutes. If you did not request it, you can ignore this email.</p>
    <p style="margin:24px 0 0;color:#6b7280;font-size:14px">— NoteKoi</p>
  </div>`;

/**
 * Sends the OTP email.
 *
 * Without SMTP credentials the API must still be usable in development, so the
 * email (recipient, subject, code) is printed to the server console instead.
 * In production config refuses to boot without SMTP, and this function throws
 * rather than silently dropping a verification code.
 */
export const sendOtpEmail = async (input: OtpEmailInput): Promise<void> => {
  const subject = subjectFor(input.purpose);

  if (!config.smtp.isConfigured) {
    if (config.isProduction) {
      throw new AppError(503, "Email delivery is not configured on this server", "MAIL_NOT_CONFIGURED");
    }

    console.log(
      [
        "",
        "──────────────────────────── EMAIL (console fallback) ────────────────────────────",
        `  to:      ${input.to}`,
        `  subject: ${subject}`,
        `  purpose: ${input.purpose}`,
        `  code:    ${input.code}`,
        `  expires: ${expiryMinutes} minutes`,
        "  (SMTP is not configured; set SMTP_HOST/SMTP_USER/SMTP_PASS to send real email)",
        "─────────────────────────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
    return;
  }

  await getTransporter().sendMail({
    from: config.smtp.from ?? config.smtp.user,
    to: input.to,
    subject,
    text: textFor(input),
    html: htmlFor(input),
  });
};

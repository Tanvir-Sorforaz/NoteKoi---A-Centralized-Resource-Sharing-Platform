import { apiGet, apiPost } from "@/lib/api";
import type { LoginResult, Me, MessageResult, RegisterInput, RegisterResult } from "./types";

/** Every auth HTTP call lives here (S1-F2, rule 1 of Section 7C). */
export const fetchMe = (signal?: AbortSignal): Promise<Me> => apiGet<Me>("/auth/me", signal);

export const register = async (input: RegisterInput): Promise<RegisterResult> =>
  (await apiPost<RegisterResult>("/auth/register", input)).data;

export const verifyEmail = async (input: { email: string; code: string }): Promise<MessageResult> =>
  (await apiPost<MessageResult>("/auth/verify-email", input)).data;

export const resendVerification = async (input: { email: string }): Promise<MessageResult> =>
  (await apiPost<MessageResult>("/auth/resend-verification", input)).data;

export const login = async (input: { email: string; password: string }): Promise<LoginResult> =>
  (await apiPost<LoginResult>("/auth/login", input)).data;

export const logout = async (): Promise<MessageResult> => (await apiPost<MessageResult>("/auth/logout", {})).data;

export const forgotPassword = async (input: { email: string }): Promise<MessageResult> =>
  (await apiPost<MessageResult>("/auth/forgot-password", input)).data;

export const resetPassword = async (input: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<MessageResult> => (await apiPost<MessageResult>("/auth/reset-password", input)).data;

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import * as authApi from "../api";
import type { LoginResult, Me, MessageResult, RegisterInput, RegisterResult } from "../types";

export const authKeys = {
  me: ["auth", "me"] as const,
};

/** Bootstraps the session from the httpOnly cookie; a 401 is an expected state, not an error to retry. */
export const useMe = () =>
  useQuery<Me, ApiError>({
    queryKey: authKeys.me,
    queryFn: ({ signal }) => authApi.fetchMe(signal),
    retry: (failureCount, error) => !error.isUnauthorized && failureCount < 1,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

export const useLogin = () => {
  const queryClient = useQueryClient();

  return useMutation<LoginResult, ApiError, { email: string; password: string }>({
    mutationFn: authApi.login,
    onSuccess: (session) => {
      queryClient.setQueryData(authKeys.me, session.user);
    },
  });
};

export const useLogout = () => {
  const queryClient = useQueryClient();

  return useMutation<MessageResult, ApiError, void>({
    mutationFn: authApi.logout,
    onSettled: () => {
      queryClient.removeQueries({ queryKey: authKeys.me });
    },
  });
};

export const useRegister = () =>
  useMutation<RegisterResult, ApiError, RegisterInput>({ mutationFn: authApi.register });

export const useVerifyEmail = () =>
  useMutation<MessageResult, ApiError, { email: string; code: string }>({ mutationFn: authApi.verifyEmail });

export const useResendVerification = () =>
  useMutation<MessageResult, ApiError, { email: string }>({ mutationFn: authApi.resendVerification });

export const useForgotPassword = () =>
  useMutation<MessageResult, ApiError, { email: string }>({ mutationFn: authApi.forgotPassword });

export const useResetPassword = () =>
  useMutation<MessageResult, ApiError, { email: string; code: string; newPassword: string }>({
    mutationFn: authApi.resetPassword,
  });

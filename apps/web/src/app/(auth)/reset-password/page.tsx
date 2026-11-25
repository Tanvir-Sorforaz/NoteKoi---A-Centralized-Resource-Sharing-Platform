"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useResetPassword } from "@/features/auth/hooks/use-auth";
import { resetPasswordSchema, type ResetPasswordValues } from "@/features/auth/schemas";
import { ApiError } from "@/lib/api";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reset = useResetPassword();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email: searchParams.get("email") ?? "", code: "", newPassword: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await reset.mutateAsync(values);
      toast.success(result.message);
      router.push(`/login?email=${encodeURIComponent(values.email)}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not reset the password.");
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>Enter the 6-digit code from the email and your new password.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <FormField id="reset-email" label="Email" error={errors.email?.message}>
            <Input id="reset-email" type="email" autoComplete="email" {...register("email")} />
          </FormField>

          <FormField id="reset-code" label="6-digit code" error={errors.code?.message}>
            <Input
              id="reset-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              className="tracking-[0.4em]"
              {...register("code")}
            />
          </FormField>

          <FormField
            id="reset-password"
            label="New password"
            error={errors.newPassword?.message}
            hint="At least 8 characters, with a letter and a number."
          >
            <Input id="reset-password" type="password" autoComplete="new-password" {...register("newPassword")} />
          </FormField>

          <Button type="submit" disabled={isSubmitting || reset.isPending}>
            {isSubmitting || reset.isPending ? "Saving…" : "Set new password"}
          </Button>
        </form>

        <Link href="/forgot-password" className="text-sm text-muted-foreground underline underline-offset-4">
          Need a new code?
        </Link>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-md">
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <ResetPasswordContent />
      </Suspense>
    </div>
  );
}

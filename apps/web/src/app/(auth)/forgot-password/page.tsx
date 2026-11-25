"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useForgotPassword } from "@/features/auth/hooks/use-auth";
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/features/auth/schemas";
import { ApiError } from "@/lib/api";

/** S1-F8 — the answer is always neutral (no account enumeration). */
export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const forgot = useForgotPassword();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await forgot.mutateAsync(values);
      setSentTo(values.email);
      toast.success("If an account exists, a reset code is on its way.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not send the reset code.");
    }
  });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Forgot your password?</CardTitle>
          <CardDescription>We send a 6-digit code to your email. It expires in 15 minutes.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {sentTo ? (
            <Alert variant="info">
              <AlertTitle>Check your inbox</AlertTitle>
              <AlertDescription className="flex flex-col gap-2">
                <span>If an account exists for {sentTo}, a reset code has been sent.</span>
                <Link
                  href={`/reset-password?email=${encodeURIComponent(sentTo)}`}
                  className="font-medium underline underline-offset-4"
                >
                  Enter the code
                </Link>
              </AlertDescription>
            </Alert>
          ) : null}

          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <FormField id="forgot-email" label="Email" error={errors.email?.message}>
              <Input id="forgot-email" type="email" autoComplete="email" {...register("email")} />
            </FormField>

            <Button type="submit" disabled={isSubmitting || forgot.isPending}>
              {isSubmitting || forgot.isPending ? "Sending…" : "Send reset code"}
            </Button>
          </form>

          <Link href="/login" className="text-sm text-muted-foreground underline underline-offset-4">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

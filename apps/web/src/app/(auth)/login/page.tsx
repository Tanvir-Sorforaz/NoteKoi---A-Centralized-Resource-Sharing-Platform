"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLogin } from "@/features/auth/hooks/use-auth";
import { loginSchema, type LoginValues } from "@/features/auth/schemas";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();
  const [blockedEmail, setBlockedEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setBlockedEmail(null);

    try {
      const session = await login.mutateAsync(values);
      toast.success(`Welcome back, ${session.user.name}.`);
      router.push("/dashboard");
    } catch (error) {
      if (!(error instanceof ApiError)) {
        toast.error("Something went wrong. Please try again.");
        return;
      }

      if (error.code === "EMAIL_NOT_VERIFIED") {
        setBlockedEmail(values.email);
        return;
      }

      toast.error(error.message);
    }
  });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use the email you registered with.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {blockedEmail ? (
            <Alert variant="warning">
              <AlertTitle>Verify your email first</AlertTitle>
              <AlertDescription>
                We sent a 6-digit code to {blockedEmail}.{" "}
                <Link
                  href={`/verify-email?email=${encodeURIComponent(blockedEmail)}`}
                  className="font-medium underline underline-offset-4"
                >
                  Enter the code
                </Link>
              </AlertDescription>
            </Alert>
          ) : null}

          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <FormField id="login-email" label="Email" error={errors.email?.message}>
              <Input id="login-email" type="email" autoComplete="email" {...register("email")} />
            </FormField>

            <FormField id="login-password" label="Password" error={errors.password?.message}>
              <Input id="login-password" type="password" autoComplete="current-password" {...register("password")} />
            </FormField>

            <Button type="submit" disabled={isSubmitting || login.isPending}>
              {isSubmitting || login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <Link href="/forgot-password" className="text-muted-foreground underline underline-offset-4">
              Forgot your password?
            </Link>
            <Link href="/register" className="font-medium underline underline-offset-4">
              Create an account
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

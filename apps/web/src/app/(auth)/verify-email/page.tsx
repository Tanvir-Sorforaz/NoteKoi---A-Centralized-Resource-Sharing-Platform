"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/states";
import { FormField } from "@/components/form-field";
import { useResendVerification, useVerifyEmail } from "@/features/auth/hooks/use-auth";
import { ApiError } from "@/lib/api";

/** S1-F6 — OTP entry with a 60 s resend cooldown (D7). */
function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verify = useVerifyEmail();
  const resend = useResendVerification();

  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = window.setInterval(() => setCooldown((seconds) => Math.max(seconds - 1, 0)), 1000);

    return () => window.clearInterval(timer);
  }, [cooldown]);

  const onVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (code.trim().length !== 6) {
      toast.error("Enter the 6-digit code from the email.");
      return;
    }

    try {
      const result = await verify.mutateAsync({ email: email.trim(), code: code.trim() });
      toast.success(result.message);
      router.push(`/login?email=${encodeURIComponent(email.trim())}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Verification failed. Please try again.");
    }
  };

  const onResend = async () => {
    try {
      const result = await resend.mutateAsync({ email: email.trim() });
      setCooldown(result.retryAfterSeconds ?? 60);
      toast.success(result.message);
    } catch (error) {
      if (error instanceof ApiError) {
        setCooldown(error.retryAfterSeconds ?? 60);
        toast.error(error.message);
        return;
      }

      toast.error("Could not resend the code. Please try again.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify your email</CardTitle>
        <CardDescription>
          We emailed a 6-digit code that expires in 15 minutes. In development (no SMTP configured) the API prints the
          code in its console.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-col gap-4" onSubmit={onVerify} noValidate>
          <FormField id="verify-email" label="Email">
            <Input
              id="verify-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </FormField>

          <FormField id="verify-code" label="6-digit code">
            <Input
              id="verify-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              className="tracking-[0.4em]"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            />
          </FormField>

          <Button type="submit" disabled={verify.isPending}>
            {verify.isPending ? "Verifying…" : "Verify email"}
          </Button>
        </form>

        <Alert>
          <AlertTitle>Didn&apos;t get the code?</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={onResend} disabled={resend.isPending || cooldown > 0}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : resend.isPending ? "Sending…" : "Resend code"}
            </Button>
            <Link href="/login" className="text-sm underline underline-offset-4">
              Back to sign in
            </Link>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="mx-auto w-full max-w-md">
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}

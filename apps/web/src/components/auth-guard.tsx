"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LoadingState } from "@/components/states";
import { useMe } from "@/features/auth/hooks/use-auth";

/**
 * S1-F3 route guard. The backend is still the authority (7C rule 4); this only
 * keeps unauthenticated visitors out of the dashboard shell.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const me = useMe();

  useEffect(() => {
    if (me.error?.isUnauthorized) {
      router.replace("/login");
    }
  }, [me.error, router]);

  if (me.isPending) {
    return <LoadingState label="Checking your session…" />;
  }

  if (me.error) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        Redirecting to the sign-in page…
      </div>
    );
  }

  if (!me.data) return null;

  return <>{children}</>;
}

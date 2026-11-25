import type * as React from "react";
import { cn } from "@/lib/utils";

/** One-line helper for the message under a field (shadcn's FormMessage pattern). */
export function FieldError({ className, ...props }: React.ComponentProps<"p">) {
  if (!props.children) return null;

  return <p className={cn("text-sm font-medium text-destructive", className)} {...props} />;
}

export function FieldHint({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-xs text-muted-foreground", className)} {...props} />;
}

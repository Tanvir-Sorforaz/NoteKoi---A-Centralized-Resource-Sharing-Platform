import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva("relative w-full rounded-lg border p-4 text-sm", {
  variants: {
    variant: {
      default: "bg-card text-card-foreground",
      info: "border-sky-200 bg-sky-50 text-sky-900",
      warning: "border-amber-200 bg-amber-50 text-amber-900",
      destructive: "border-red-200 bg-red-50 text-red-900",
      success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("mb-1 font-medium leading-none", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("text-sm leading-relaxed [&_p]:leading-relaxed", className)} {...props} />;
}

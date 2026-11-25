import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui's `cn` helper: conditional classes + Tailwind conflict merging. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

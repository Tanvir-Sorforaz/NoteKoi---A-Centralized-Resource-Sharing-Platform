/**
 * The browser always calls the Next.js origin and `next.config.ts` proxies
 * `/api/*` to the Express API (D21), so the httpOnly cookie stays first-party.
 * Nothing here is an absolute URL on purpose — see the ENV RULE in the playbook.
 */
const rawBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

export const env = {
  apiBaseUrl: rawBaseUrl.endsWith("/") ? rawBaseUrl.slice(0, -1) : rawBaseUrl,
} as const;

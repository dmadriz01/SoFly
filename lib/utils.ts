import type { EventWithCount } from "./types";

export const firstName = (name: string | null | undefined) =>
  (name ?? "").trim().split(/\s+/)[0] || "Someone";

/** Only allow same-site relative paths as post-login redirect targets. */
export function safeNext(next: string | null | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return "/";
  return next;
}

export const spotsTaken = (e: Pick<EventWithCount, "rsvps">) =>
  e.rsvps?.[0]?.count ?? 0;

// Who counts as an admin. Kept free of any server imports so it can be tested on its own.

/** The addresses listed in ADMIN_EMAILS (comma or whitespace separated), lower-cased. */
export function parseAdminEmails(raw: string | undefined = process.env.ADMIN_EMAILS): string[] {
  return (raw ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().replace(/^["']|["']$/g, "").toLowerCase())
    .filter((e) => e.includes("@"));
}

/**
 * An exact match against the list, ignoring case. Nothing else counts: no wildcards, no whole
 * domains, and an empty or missing list means there are no admins at all.
 */
export function isAdminEmail(email: string | null | undefined, raw?: string): boolean {
  if (!email) return false;
  return parseAdminEmails(raw ?? process.env.ADMIN_EMAILS).includes(email.trim().toLowerCase());
}

/** What the login system says about a person: only a verified address can make someone an admin. */
export type AuthUserLike = { email?: string | null; email_confirmed_at?: string | null } | null | undefined;

export function isAdminUser(user: AuthUserLike, raw?: string): boolean {
  return Boolean(user?.email && user.email_confirmed_at && isAdminEmail(user.email, raw));
}

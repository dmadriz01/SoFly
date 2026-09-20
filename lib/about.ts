import { parseHandle, socialUrl, SOCIALS, type SocialKey } from "./social";

export const BIO_MAX = 500;

/** A saved "about you", as stored. */
export type About = {
  bio: string;
  linkedin: string | null;
  instagram: string | null;
  x_handle: string | null;
  tiktok: string | null;
  facebook: string | null;
};

export type AboutInput = { bio: string } & Record<SocialKey, string>;
export type AboutErrors = Partial<Record<"bio" | SocialKey, string>>;

/** Checks the form and turns pasted links into usernames. */
export function parseAbout(
  input: AboutInput
): { ok: true; value: About } | { ok: false; errors: AboutErrors } {
  const errors: AboutErrors = {};
  const bio = input.bio.trim();
  if (bio.length > BIO_MAX) errors.bio = `Keep it under ${BIO_MAX} characters.`;

  const value: About = { bio, linkedin: null, instagram: null, x_handle: null, tiktok: null, facebook: null };
  for (const social of SOCIALS) {
    const result = parseHandle(social.key, input[social.key] ?? "");
    if ("error" in result) errors[social.key] = result.error;
    else value[social.column] = result.handle;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/** The links to show for a saved profile, in a fixed order. */
export function aboutLinks(about: Pick<About, "linkedin" | "instagram" | "x_handle" | "tiktok" | "facebook">) {
  return SOCIALS.flatMap((s) => {
    const handle = about[s.column];
    return handle ? [{ key: s.key, label: s.label, url: socialUrl(s.key, handle), handle }] : [];
  });
}

export const hasAbout = (a: About | null | undefined) =>
  Boolean(a && (a.bio.trim() || aboutLinks(a).length > 0));

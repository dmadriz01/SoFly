// Social profiles on a person's "about you". We store only the username, never a link, and build
// the link ourselves from a fixed address. So a link can only ever go to the app it says it does,
// and a stranger can't put a look-alike site in front of a host.

export type SocialKey = "linkedin" | "instagram" | "x" | "tiktok" | "facebook";

export const SOCIALS: {
  key: SocialKey;
  /** The column the username is stored in. */
  column: "linkedin" | "instagram" | "x_handle" | "tiktok" | "facebook";
  label: string;
  placeholder: string;
  base: string;
  hosts: string[];
}[] = [
  { key: "linkedin", column: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/in/your-name", base: "https://www.linkedin.com/in/", hosts: ["linkedin.com"] },
  { key: "instagram", column: "instagram", label: "Instagram", placeholder: "@yourname", base: "https://www.instagram.com/", hosts: ["instagram.com"] },
  { key: "x", column: "x_handle", label: "X", placeholder: "@yourname", base: "https://x.com/", hosts: ["x.com", "twitter.com"] },
  { key: "tiktok", column: "tiktok", label: "TikTok", placeholder: "@yourname", base: "https://www.tiktok.com/@", hosts: ["tiktok.com"] },
  { key: "facebook", column: "facebook", label: "Facebook", placeholder: "facebook.com/yourname", base: "https://www.facebook.com/", hosts: ["facebook.com", "fb.com"] },
];

/** Matches the database rule on each username column. */
export const HANDLE_PATTERN = /^[A-Za-z0-9._-]{1,60}$/;

export type HandleResult = { handle: string | null } | { error: string };

/**
 * Accepts a username ("ann.lee", "@ann.lee") or that app's own profile link, and returns just the
 * username. Blank means "none". Links to any other site are refused.
 */
export function parseHandle(key: SocialKey, input: string): HandleResult {
  const social = SOCIALS.find((s) => s.key === key)!;
  let value = input.trim();
  if (!value) return { handle: null };

  const looksLikeLink =
    /[/:]/.test(value) || social.hosts.some((h) => value.toLowerCase().startsWith(h)) || value.toLowerCase().startsWith("www.");
  if (looksLikeLink) {
    let url: URL;
    try {
      url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
    } catch {
      return { error: `That doesn't look like a ${social.label} link or username.` };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return { error: `That link isn't from ${social.label}.` };
    const host = url.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
    if (!social.hosts.includes(host) || url.username || url.password) {
      return { error: `That link isn't from ${social.label}. Paste your ${social.label} profile link or just your username.` };
    }
    const parts = url.pathname.split("/").filter(Boolean);
    value = key === "linkedin" ? (parts[0] === "in" ? (parts[1] ?? "") : "") : (parts[0] ?? "");
  }

  value = value.replace(/^@/, "");
  if (!HANDLE_PATTERN.test(value)) {
    return {
      error:
        key === "linkedin"
          ? "Paste your LinkedIn profile link (linkedin.com/in/your-name) or just the part after /in/."
          : `Use just your ${social.label} username: letters, numbers, dots, dashes and underscores.`,
    };
  }
  return { handle: value };
}

/** The profile link for a stored username. */
export const socialUrl = (key: SocialKey, handle: string) =>
  SOCIALS.find((s) => s.key === key)!.base + encodeURIComponent(handle);

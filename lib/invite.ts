import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// "Bring a friend": the link someone shares carries a signed token, ?ref=<inviter>.<signature>.
// The signature covers BOTH the meetup and the inviter, so a link can't be forged, edited to name
// someone else, or reused on a different meetup. (A bare user id in a link would let anyone probe
// whether a particular person is going to a private meetup.) The signing key comes from
// INVITE_SECRET if set, otherwise it's derived from the server's service key, so nothing new needs
// setting up. With neither, invites are simply switched off.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function key(): string | null {
  const explicit = process.env.INVITE_SECRET?.trim();
  if (explicit) return explicit;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return service ? `sofly-invite:${service}` : null;
}

const sign = (secret: string, eventId: string, inviterId: string) =>
  createHmac("sha256", secret).update(`${eventId}:${inviterId.toLowerCase()}`).digest("hex").slice(0, 24);

/** The token to put in a shared link, or null when invites aren't set up. */
export function signInvite(eventId: string, inviterId: string): string | null {
  const secret = key();
  if (!secret || !UUID.test(eventId) || !UUID.test(inviterId)) return null;
  return `${inviterId.toLowerCase()}.${sign(secret, eventId, inviterId)}`;
}

/** Who a token names as the inviter for this meetup, or null if it's missing, altered or for another meetup. */
export function verifyInvite(eventId: string, token: unknown): string | null {
  const secret = key();
  if (!secret || typeof token !== "string" || token.length > 80 || !UUID.test(eventId)) return null;
  const [inviterId, given, ...rest] = token.split(".");
  if (rest.length > 0 || !inviterId || !given || !UUID.test(inviterId) || !/^[0-9a-f]{24}$/.test(given)) return null;
  const expected = sign(secret, eventId, inviterId);
  const a = Buffer.from(given, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? inviterId.toLowerCase() : null;
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as email from "./email-templates";
import { mailConfigured, sendMail, type Mail, type MailResult } from "./mailer";
import { pushConfigured, sendPushToUser, vapidSubject, type PushOutcome, type PushPayload } from "./push";
import { SITE_URL } from "./site";
import { createAdminClient } from "./supabase/admin";
import { firstName } from "./utils";

export type Check = { label: string; ok: boolean; detail?: string };

type Deps = {
  admin?: SupabaseClient | null;
  send?: (mail: Mail) => Promise<MailResult>;
  mailConfigured?: boolean;
  cronSecretSet?: boolean;
};

/**
 * What to do about a mail server error, in plain words (never includes a password). The commonest one
 * is Gmail refusing the login: the address and app password don't belong to the same account.
 */
export function mailErrorHint(detail: string | undefined): string {
  const d = detail ?? "";
  if (/\b535\b|EAUTH|Username and Password not accepted/i.test(d)) {
    return " What to check: (1) ALERT_EMAIL_USER is the full Gmail address (name@gmail.com), with nothing else in the box. (2) ALERT_EMAIL_APP_PASSWORD is a 16-letter App Password created in THAT SAME Gmail account (myaccount.google.com/apppasswords, which needs 2-Step Verification on), not the normal Gmail password, and not one from a different account. (3) After changing either one in Vercel, redeploy: the running site keeps the old values until then.";
  }
  if (/ETIMEDOUT|ECONNECTION|ECONNREFUSED|ESOCKET|ENOTFOUND/i.test(d)) {
    return " This looks like a network problem reaching Gmail, not a wrong password. Try again in a minute.";
  }
  if (/\b(550|553|554)\b/.test(d)) {
    return " Gmail refused the message itself (not the login). Check the recipient address, and the Gmail account for a security alert or sending limit.";
  }
  return "";
}

/**
 * Walks the whole email chain for one person and reports which link is broken, without ever
 * revealing a secret: is a mail account set up, is the server key set and accepted, are emails
 * switched on for this person, and does a real test email get accepted by the mail server.
 */
export async function diagnoseEmail(
  who: { userId: string; userEmail: string; name: string },
  deps: Deps = {}
): Promise<Check[]> {
  const admin = deps.admin === undefined ? createAdminClient() : deps.admin;
  const send = deps.send ?? sendMail;
  const hasMail = deps.mailConfigured ?? mailConfigured();
  const cronSecretSet = deps.cronSecretSet ?? Boolean(process.env.CRON_SECRET);
  const checks: Check[] = [];

  checks.push({
    label: "Mail account is set up",
    ok: hasMail,
    detail: hasMail ? undefined : "Add ALERT_EMAIL_USER and ALERT_EMAIL_APP_PASSWORD in Vercel, then redeploy.",
  });

  checks.push({
    label: "Server key is set up",
    ok: Boolean(admin),
    detail: admin ? undefined : "Add SUPABASE_SERVICE_ROLE_KEY in Vercel, then redeploy.",
  });

  if (admin) {
    const lookup = await admin.auth.admin.getUserById(who.userId);
    const worked = !lookup.error && Boolean(lookup.data?.user?.email);
    checks.push({
      label: "Supabase accepts the server key",
      ok: worked,
      detail: worked ? undefined : `Supabase said: ${lookup.error?.message ?? "no account found"}. Check the key was copied in full.`,
    });

    const { data: settings } = await admin.from("user_settings").select("email_notifications").eq("user_id", who.userId).maybeSingle();
    const on = settings?.email_notifications !== false;
    checks.push({
      label: "Emails are switched on for you",
      ok: on,
      detail: on ? undefined : "You've switched emails off on the Me tab. SoFly skips people who did that.",
    });
  }

  checks.push({
    label: "Daily job secret is set up",
    ok: cronSecretSet,
    detail: cronSecretSet ? undefined : "Add CRON_SECRET in Vercel, then redeploy. Without it the daily job refuses to run.",
  });

  if (hasMail) {
    const result = await send({ to: who.userEmail, ...email.testEmail({ name: firstName(who.name), siteUrl: SITE_URL }) });
    checks.push({
      label: "Test email accepted by the mail server",
      ok: result.ok,
      detail: result.ok
        ? `Sent to ${who.userEmail}. If it isn't in your inbox within a minute, check spam.`
        : result.reason === "smtp-error"
          ? `The mail server refused it: ${result.detail}${mailErrorHint(result.detail)}`
          : "No mail account.",
    });
  }

  return checks;
}

type PushDeps = {
  admin?: SupabaseClient | null;
  push?: (userId: string, payload: PushPayload) => Promise<PushOutcome>;
  publicKeySet?: boolean;
  privateKeySet?: boolean;
  subject?: string | null;
};

/**
 * Walks the push chain for one person: are the key pair and contact set up, is the server key set,
 * how many devices are subscribed, and does a real test notification get accepted by each push service.
 */
export async function diagnosePush(who: { userId: string }, deps: PushDeps = {}): Promise<Check[]> {
  const admin = deps.admin === undefined ? createAdminClient() : deps.admin;
  const publicKeySet = deps.publicKeySet ?? Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const privateKeySet = deps.privateKeySet ?? Boolean(process.env.VAPID_PRIVATE_KEY);
  const subject = deps.subject === undefined ? vapidSubject() : deps.subject;
  const checks: Check[] = [];

  checks.push({
    label: "Push public key is set up",
    ok: publicKeySet,
    detail: publicKeySet ? undefined : "Add NEXT_PUBLIC_VAPID_PUBLIC_KEY in Vercel, then redeploy.",
  });
  checks.push({
    label: "Push private key is set up",
    ok: privateKeySet,
    detail: privateKeySet ? undefined : "Add VAPID_PRIVATE_KEY in Vercel, then redeploy.",
  });
  checks.push({
    label: "Push contact address is set up",
    ok: Boolean(subject),
    detail: subject ? undefined : "Set NEXT_PUBLIC_CONTACT_EMAIL (or VAPID_SUBJECT) in Vercel, then redeploy.",
  });
  checks.push({
    label: "Server key is set up",
    ok: Boolean(admin),
    detail: admin ? undefined : "Add SUPABASE_SERVICE_ROLE_KEY in Vercel, then redeploy.",
  });

  if (admin && publicKeySet && privateKeySet && subject) {
    const { data: devices } = await admin.from("push_subscriptions").select("id").eq("user_id", who.userId);
    const count = devices?.length ?? 0;
    checks.push({
      label: "You have a device with push turned on",
      ok: count > 0,
      detail: count > 0 ? `${count} ${count === 1 ? "device" : "devices"}.` : "Turn push on for this device first (the button above).",
    });
    if (count > 0) {
      const push = deps.push ?? ((id, p) => sendPushToUser(admin, id, p));
      const outcome = await push(who.userId, {
        title: "SoFly test",
        body: "Push notifications work on this device.",
        url: "/me",
        tag: "test",
      });
      const okAll = outcome.sent > 0 && outcome.failed === 0;
      checks.push({
        label: "The push service accepted the test notification",
        ok: okAll,
        detail: okAll
          ? `Sent to ${outcome.sent} ${outcome.sent === 1 ? "device" : "devices"}.${outcome.removed ? ` Removed ${outcome.removed} expired.` : ""}`
          : outcome.firstFailure ?? (outcome.removed ? "That device had expired and was removed. Turn push on again." : "Nothing was sent."),
      });
    }
  }
  return checks;
}

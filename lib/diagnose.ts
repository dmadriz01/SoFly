import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as email from "./email-templates";
import { mailConfigured, sendMail, type Mail, type MailResult } from "./mailer";
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
      detail: on ? undefined : "You've switched emails off on the Me tab. BayMeet skips people who did that.",
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
          ? `The mail server refused it: ${result.detail}`
          : "No mail account.",
    });
  }

  return checks;
}

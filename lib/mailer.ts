import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

export type Mail = { to: string; subject: string; text: string; html?: string };

/** Why an email wasn't sent, in words that are safe to show (never includes a password). */
export type MailResult =
  | { ok: true }
  | { ok: false; reason: "not-configured" | "smtp-error"; detail?: string };

/**
 * A setting as pasted into Vercel, tidied up: surrounding spaces and line breaks removed, and one
 * pair of quotes around the whole value removed. (A stray space or quote in an email address or
 * password makes Gmail refuse the login, and it's hard to see in a settings box.)
 */
export function cleanSetting(value: string | undefined): string {
  const v = (value ?? "").trim();
  return /^(["']).*\1$/.test(v) ? v.slice(1, -1).trim() : v;
}

/** The Gmail address and app password to sign in with. Google shows an app password in groups of four letters with spaces; the spaces aren't part of it. */
export const mailCredentials = () => ({
  user: cleanSetting(process.env.ALERT_EMAIL_USER),
  pass: cleanSetting(process.env.ALERT_EMAIL_APP_PASSWORD).replace(/\s/g, ""),
});

/** Whether a mail account is set up at all: the Gmail address and app password. */
export const mailConfigured = () => {
  const { user, pass } = mailCredentials();
  return Boolean(user && pass);
};

let transporter: Transporter | null = null;

/**
 * Sends one email. Never throws: a failed email must never break what the person was doing.
 * Says whether it was handed to the mail server, and if not, why.
 */
export async function sendMail(mail: Mail): Promise<MailResult> {
  const { user, pass } = mailCredentials();
  if (!user || !pass) {
    console.warn("Email not sent: set ALERT_EMAIL_USER and ALERT_EMAIL_APP_PASSWORD.");
    return { ok: false, reason: "not-configured" };
  }

  try {
    transporter ??= nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
    await transporter.sendMail({ from: `SoFly <${user}>`, ...mail });
    return { ok: true };
  } catch (err) {
    console.error("Email failed to send:", err);
    const e = err as { code?: string; responseCode?: number; message?: string };
    const detail = [e.code, e.responseCode, (e.message ?? "").split("\n")[0].slice(0, 140)].filter(Boolean).join(" · ");
    return { ok: false, reason: "smtp-error", detail };
  }
}

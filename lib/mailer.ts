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

/**
 * Which mail server to use. Gmail unless ALERT_EMAIL_HOST says otherwise (for example Brevo's
 * smtp-relay.brevo.com), so the app isn't tied to a Gmail account. Port 465 is the encrypted-from-the-start
 * kind; other ports (like 587) start plain and upgrade, which is what nodemailer does when `secure` is off.
 */
export const mailServer = () => {
  const port = Number(cleanSetting(process.env.ALERT_EMAIL_PORT));
  return { host: cleanSetting(process.env.ALERT_EMAIL_HOST) || "smtp.gmail.com", port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 465 };
};

/** The address messages come from: ALERT_EMAIL_FROM if set (needed when the login isn't an address), else the login. */
export const mailFrom = () => cleanSetting(process.env.ALERT_EMAIL_FROM) || mailCredentials().user;

/** Whether a mail account is set up at all: the Gmail address and app password. */
export const mailConfigured = () => {
  const { user, pass } = mailCredentials();
  return Boolean(user && pass);
};

let transporter: Transporter | null = null;
let transporterFor = "";

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
    const { host, port } = mailServer();
    // Rebuilt if the settings changed (a new deployment normally restarts things anyway).
    const signature = `${host}:${port}:${user}:${pass.length}`;
    if (!transporter || transporterFor !== signature) {
      transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 10000,
      });
      transporterFor = signature;
    }
    await transporter.sendMail({ from: `SoFly <${mailFrom()}>`, ...mail });
    return { ok: true };
  } catch (err) {
    console.error("Email failed to send:", err);
    const e = err as { code?: string; responseCode?: number; message?: string };
    const detail = [e.code, e.responseCode, (e.message ?? "").split("\n")[0].slice(0, 140)].filter(Boolean).join(" · ");
    return { ok: false, reason: "smtp-error", detail };
  }
}

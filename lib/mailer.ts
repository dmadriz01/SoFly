import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

export type Mail = { to: string; subject: string; text: string; html?: string };

/** Which mailbox we send from. The same Gmail account and app password used for report alerts. */
export const mailConfigured = () =>
  Boolean(process.env.ALERT_EMAIL_USER && process.env.ALERT_EMAIL_APP_PASSWORD);

let transporter: Transporter | null = null;

/**
 * Sends one email. Never throws: a failed email must never break what the person was doing.
 * Returns whether it was handed to the mail server.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  const user = process.env.ALERT_EMAIL_USER;
  const pass = process.env.ALERT_EMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !pass) {
    console.warn("Email not sent: set ALERT_EMAIL_USER and ALERT_EMAIL_APP_PASSWORD.");
    return false;
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
    await transporter.sendMail({ from: `BayMeet <${user}>`, ...mail });
    return true;
  } catch (err) {
    console.error("Email failed to send:", err);
    return false;
  }
}

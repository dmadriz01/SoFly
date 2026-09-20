import nodemailer from "nodemailer";
import { CONTACT_EMAIL, SITE_URL } from "./site";

export type ReportAlert = {
  eventId: string;
  eventTitle: string;
  hostName: string;
  reason: string;
  details: string;
  reporterEmail: string;
};

const oneLine = (v: string) => v.replace(/[\r\n]+/g, " ").trim();

/** Plain text only, so nothing a user typed can be interpreted as markup. */
export function buildReportEmail(r: ReportAlert) {
  const subject = `BayMeet report: ${oneLine(r.eventTitle).slice(0, 80)} (${oneLine(r.reason)})`;
  const text = [
    "Someone reported a meetup on BayMeet.",
    "",
    `Meetup:   ${oneLine(r.eventTitle)}`,
    `Host:     ${oneLine(r.hostName) || "unknown"}`,
    `Reason:   ${oneLine(r.reason)}`,
    `Details:  ${r.details || "(none)"}`,
    `Reporter: ${r.reporterEmail || "unknown"}`,
    "",
    `View it:  ${SITE_URL}/events/${r.eventId}`,
    "",
    "To cancel it, run this in the Supabase SQL editor:",
    `  update public.events set cancelled_at = now() where id = '${r.eventId}';`,
    "",
    "Do nothing and it stays live.",
  ].join("\n");
  return { subject, text };
}

/**
 * Emails the moderator. Never throws: a failed alert must not fail the user's report.
 * Needs ALERT_EMAIL_USER and ALERT_EMAIL_APP_PASSWORD (a Gmail address and app password).
 * Goes to REPORT_ALERT_EMAIL, or the public contact email if that isn't set.
 */
export async function sendReportAlert(report: ReportAlert) {
  const user = process.env.ALERT_EMAIL_USER;
  const pass = process.env.ALERT_EMAIL_APP_PASSWORD?.replace(/\s/g, "");
  const to = process.env.REPORT_ALERT_EMAIL || CONTACT_EMAIL;

  if (!user || !pass || !to) {
    console.warn("Report alert not sent: set ALERT_EMAIL_USER, ALERT_EMAIL_APP_PASSWORD and a recipient.");
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
    const { subject, text } = buildReportEmail(report);
    await transporter.sendMail({ from: `BayMeet alerts <${user}>`, to, subject, text });
  } catch (err) {
    console.error("Report alert failed to send:", err);
  }
}

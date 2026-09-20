import { sendMail } from "./mailer";
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
 * Emails the moderator. Goes to REPORT_ALERT_EMAIL, or the public contact email if that isn't set.
 */
export async function sendReportAlert(report: ReportAlert) {
  const to = process.env.REPORT_ALERT_EMAIL || CONTACT_EMAIL;
  if (!to) {
    console.warn("Report alert not sent: no recipient (set REPORT_ALERT_EMAIL or NEXT_PUBLIC_CONTACT_EMAIL).");
    return;
  }
  const { subject, text } = buildReportEmail(report);
  const result = await sendMail({ to, subject, text });
  if (!result.ok) console.error("Report alert not delivered:", result.reason, result.detail ?? "");
}

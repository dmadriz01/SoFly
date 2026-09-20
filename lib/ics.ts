/** A calendar file (iCalendar, RFC 5545) so a meetup can be added to any calendar app. */

const escapeText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Lines may be at most 75 bytes; longer ones continue on the next line after a space. */
function fold(line: string): string {
  const enc = new TextEncoder();
  const lines: string[] = [];
  let cur = "";
  let used = 0;
  for (const ch of line) {
    const bytes = enc.encode(ch).length;
    if (used + bytes > 75) {
      lines.push(cur);
      cur = ` ${ch}`;
      used = 1 + bytes;
    } else {
      cur += ch;
      used += bytes;
    }
  }
  lines.push(cur);
  return lines.join("\r\n");
}

export function buildIcs(e: {
  id: string;
  title: string;
  start: Date;
  /** Meetups don't store an end time, so calendars get a sensible default. */
  minutes?: number;
  location: string;
  description: string;
  url: string;
  cancelled: boolean;
}) {
  const end = new Date(e.start.getTime() + (e.minutes ?? 120) * 60_000);
  const alarm = (trigger: string, text: string) => [
    "BEGIN:VALARM",
    `TRIGGER:${trigger}`,
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(text)}`,
    "END:VALARM",
  ];

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BayMeet//Meetups//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@baymeet`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(e.title)}`,
    `LOCATION:${escapeText(e.location)}`,
    `DESCRIPTION:${escapeText(`${e.description ? `${e.description}\n\n` : ""}Details: ${e.url}`)}`,
    `URL:${e.url}`,
    `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    // Reminders, handled by the person's own calendar app.
    ...alarm("-P1D", `Tomorrow: ${e.title}`),
    ...alarm("-PT1H", `In an hour: ${e.title}`),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

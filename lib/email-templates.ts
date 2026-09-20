// The emails BayMeet sends. Pure functions (no network), so they're easy to test.
// Everything a person typed (names, titles) is HTML-escaped; the plain-text version goes along
// for mail apps that don't show HTML.

export type Email = { subject: string; text: string; html: string };

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

type Layout = {
  heading: string;
  paragraphs: string[];
  cta: { label: string; url: string };
  siteUrl: string;
};

function layout({ heading, paragraphs, cta, siteUrl }: Layout): { text: string; html: string } {
  const settings = `${siteUrl}/me`;
  const text = [
    heading,
    "",
    ...paragraphs.flatMap((p) => [p, ""]),
    `${cta.label}: ${cta.url}`,
    "",
    "-",
    `You get these emails because you use BayMeet. Manage them any time: ${settings}`,
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#fbf8f3;">
<div style="padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#2b2622;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #ebe2d7;border-radius:16px;padding:28px;">
    <p style="margin:0 0 20px;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Bay<span style="color:#d9552f;">Meet</span></p>
    <h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;">${esc(heading)}</h1>
    ${paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#4a423c;">${esc(p)}</p>`).join("\n    ")}
    <p style="margin:22px 0 0;"><a href="${esc(cta.url)}" style="display:inline-block;background:#d9552f;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:13px 22px;border-radius:12px;">${esc(cta.label)}</a></p>
  </div>
  <p style="max-width:480px;margin:14px auto 0;font-size:12px;line-height:1.5;color:#7d726a;text-align:center;">
    You get these emails because you use BayMeet. <a href="${esc(settings)}" style="color:#7d726a;">Manage them</a> any time.
  </p>
</div></body></html>`;
  return { text, html };
}

/** To a host: someone wants to join their approval-only meetup. */
export function requestReceived(a: {
  hostName: string;
  requesterName: string;
  eventTitle: string;
  eventUrl: string;
  siteUrl: string;
}): Email {
  const title = oneLine(a.eventTitle);
  const body = layout({
    heading: `${a.requesterName} would like to join ${title}`,
    paragraphs: [
      `Hi ${a.hostName}, ${a.requesterName} asked to join your meetup.`,
      "Open it to see their profile and any note they added, then approve or decline. It only takes a moment.",
    ],
    cta: { label: "Review the request", url: a.eventUrl },
    siteUrl: a.siteUrl,
  });
  return { subject: `${oneLine(a.requesterName)} wants to join ${title.slice(0, 60)}`, ...body };
}

/** To a requester: the host's answer. */
export function requestDecision(a: {
  name: string;
  eventTitle: string;
  approved: boolean;
  eventUrl: string;
  siteUrl: string;
}): Email {
  const title = oneLine(a.eventTitle);
  const body = a.approved
    ? layout({
        heading: `You're in: ${title}`,
        paragraphs: [
          `Hi ${a.name}, the host approved your request.`,
          "The exact address and any group chat link are now on the meetup page. You can also add it to your calendar there.",
        ],
        cta: { label: "See the details", url: a.eventUrl },
        siteUrl: a.siteUrl,
      })
    : layout({
        heading: `An update on ${title}`,
        paragraphs: [
          `Hi ${a.name}, the host couldn't fit you into this one.`,
          "That's not a judgment on you. Small meetups have limited spots. There are plenty more happening around the Bay.",
        ],
        cta: { label: "Find another meetup", url: a.siteUrl },
        siteUrl: a.siteUrl,
      });
  return { subject: a.approved ? `You're in: ${title.slice(0, 70)}` : `An update on ${title.slice(0, 70)}`, ...body };
}

/** To everyone who was going: the host cancelled. */
export function eventCancelled(a: {
  name: string;
  eventTitle: string;
  when: string;
  eventUrl: string;
  siteUrl: string;
}): Email {
  const title = oneLine(a.eventTitle);
  const body = layout({
    heading: `Cancelled: ${title}`,
    paragraphs: [
      `Hi ${a.name}, the host cancelled ${title}, which was planned for ${a.when}.`,
      "Please don't show up. If it's on your calendar, you can delete it.",
    ],
    cta: { label: "Find another meetup", url: a.siteUrl },
    siteUrl: a.siteUrl,
  });
  return { subject: `Cancelled: ${title.slice(0, 70)}`, ...body };
}

/** The day before: what, when, where. */
export function reminder(a: {
  name: string;
  eventTitle: string;
  when: string;
  place: string;
  eventUrl: string;
  calendarUrl: string;
  siteUrl: string;
}): Email {
  const title = oneLine(a.eventTitle);
  const body = layout({
    heading: `Tomorrow: ${title}`,
    paragraphs: [`Hi ${a.name}, a reminder that you're going.`, `When: ${a.when}`, `Where: ${a.place}`],
    cta: { label: "Open the meetup", url: a.eventUrl },
    siteUrl: a.siteUrl,
  });
  return { subject: `Tomorrow: ${title.slice(0, 70)}`, ...body };
}

/** The day after: one-tap feedback. */
export function feedbackRequest(a: { name: string; eventTitle: string; eventUrl: string; siteUrl: string }): Email {
  const title = oneLine(a.eventTitle);
  const body = layout({
    heading: `How was ${title}?`,
    paragraphs: [
      `Hi ${a.name}, thanks for joining. Would you join a meetup like this again?`,
      "It takes one tap. Your answer is private: only the total is shown, never who said what.",
    ],
    cta: { label: "Tell us", url: a.eventUrl },
    siteUrl: a.siteUrl,
  });
  return { subject: `How was ${title.slice(0, 70)}?`, ...body };
}

/** Sent by the "Send me a test email" button, to prove the whole chain works. */
export function testEmail(a: { name: string; siteUrl: string }): Email {
  const body = layout({
    heading: "Your BayMeet emails work",
    paragraphs: [
      `Hi ${a.name}, this is a test email from BayMeet.`,
      "If you're reading it, BayMeet can email you about join requests, cancellations and reminders.",
    ],
    cta: { label: "Open BayMeet", url: a.siteUrl },
    siteUrl: a.siteUrl,
  });
  return { subject: "BayMeet test email", ...body };
}

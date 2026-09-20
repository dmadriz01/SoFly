import { sendDailyEmails } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called once a day by Vercel Cron (see vercel.json): tomorrow's reminders and yesterday's feedback requests. Vercel sends `Authorization: Bearer <CRON_SECRET>`
// when the CRON_SECRET environment variable is set; anything else is refused.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sendDailyEmails();
  return Response.json(result);
}

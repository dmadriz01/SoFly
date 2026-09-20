import { sendTomorrowReminders } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called once a day by Vercel Cron (see vercel.json). Vercel sends `Authorization: Bearer <CRON_SECRET>`
// when the CRON_SECRET environment variable is set; anything else is refused.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sendTomorrowReminders();
  return Response.json(result);
}

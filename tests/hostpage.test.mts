// The "Host on SoFly" page. `npm run test:unit`.
import fs from "node:fs";
import path from "node:path";

let passed = 0;
let failed = 0;
const t = (name: string, cond: boolean, extra = "") => {
  cond ? passed++ : failed++;
  console.log(`${cond ? "ok   " : "FAIL "}${name}${cond ? "" : "  -> " + extra}`);
};
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

const page = read("app/host/page.tsx");
t("host page: it has its own title and description for search and link previews", /title: "Host on SoFly"/.test(page) && /description: "Sign-ups, waitlists and reminders/.test(page) && /openGraph/.test(page));
t("host page: the call to action goes to posting a meetup (which asks a visitor to log in first) and appears twice", (page.match(/href="\/events\/new"/g) ?? []).length === 2);
t("host page: it links to the guidelines and back to what guests see", /href="\/guidelines"/.test(page) && /href="\/"/.test(page));
t("host page: it's reachable from every page through the footer", /href="\/host"[\s\S]{0,80}Host on SoFly/.test(read("components/Footer.tsx")));
t("host page: it needs no login and reads nothing from the database (safe for anyone, cheap to serve)", !/supabase|createClient|cookies\(/i.test(page));
t("host page: it doesn't promise anything about future pricing (free 'right now' only)", /free right now/i.test(page) && !/forever|always free|never charge/i.test(page));
t("host page: it says 18+, matching the guidelines and the rest of the app", /18 and older/.test(page) && /SoFly is for people 18 and older/.test(read("app/guidelines/page.tsx")));
// Every claim describes something the app really has: point at the code that does it.
t("claims: repeating (up to 12 dates, weekly or every two weeks)", /MAX_OCCURRENCES = 12/.test(read("lib/recurrence.ts")) && /REPEAT_CHOICES/.test(read("lib/recurrence.ts")));
t("claims: a waitlist that tells people when a spot opens", /notifySpotOpened/.test(read("lib/notify.ts")) && /event_waitlist/.test(read("supabase/schema.sql")));
t("claims: a reminder the day before and a 'Still coming?' on the day", /stillComing/.test(read("lib/notify.ts")) && /reminder/i.test(read("lib/notify.ts")));
t("claims: approve each person, with the address kept private until then", /join_mode/.test(read("supabase/schema.sql")) && /event_locations/.test(read("supabase/schema.sql")));
t("claims: invite links, with 'invited by' shown to the host", /verifyInvite/.test(read("lib/invite.ts") + read("app/events/[id]/page.tsx")) && /Invited by/.test(read("components/RequestsPanel.tsx") + read("components/GuestProfiles.tsx")));
t("claims: a wrap-up the morning after with a link to post the next one", /hostRecap/.test(read("lib/notify.ts")) && /events\/new\?from=/.test(read("lib/notify.ts")));
t("claims: login is an email code, not a password", /signInWithOtp/.test(read("components/LoginForm.tsx")));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

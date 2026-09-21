# SoFly

A hyperlocal activity board for the San Francisco Bay Area. Post a sports or social meetup, and others RSVP.

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase (magic-link auth + Postgres) · deployed on Vercel.

## Run it locally

You need Node 18.17+ and a free [Supabase](https://supabase.com) account.

### 1. Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and click **New project**. Pick any name and region, and save the database password somewhere.
2. Wait for the project to finish provisioning (about a minute).

### 2. Create the database

1. In your project, open **SQL Editor → New query**.
2. Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. You should see "Success. No rows returned."

That one file creates every table, index, security rule and trigger the app needs. (Already have a SoFly database from earlier? Skip this and see "Upgrading an existing database" below.)

### 3. Configure auth redirect URLs

In **Authentication → URL Configuration**:

- **Site URL:** `http://localhost:3000`
- **Redirect URLs:** add `http://localhost:3000/auth/callback`

Magic links only work if the callback URL is on this allow-list.

### 4. Add your keys

1. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.
2. In this directory:

   ```bash
   cp .env.local.example .env.local
   ```

3. Edit `.env.local` and fill in:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
   ```

### 5. Install and start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To try it: go to **Me** → enter your email → enter the code from the email (or click the link, in the same browser) → **Post** a meetup.

## Deploy to Vercel

1. Push this project to a GitHub repository.
2. Go to [vercel.com/new](https://vercel.com/new), import the repository, and keep the auto-detected **Next.js** preset.
3. Under **Environment Variables**, add both:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Click **Deploy**. Note your production URL, e.g. `https://your-project.vercel.app`.
5. Back in Supabase, **Authentication → URL Configuration**:
   - Set **Site URL** to your production URL.
   - Add `https://<your-production-domain>/auth/callback` to **Redirect URLs**. (Keep the localhost entry if you still develop locally.)
6. Redeploy is not needed after step 5. Open your production URL and log in.

If you use Vercel preview deployments and want login to work on them, also add `https://*-<your-team>.vercel.app/auth/callback` to the Supabase redirect URLs.

## Custom SMTP (required before public launch)

Supabase's built-in sender only emails your own team members and is capped at a few emails per hour. To let anyone log in, use your own provider. These steps use [Resend](https://resend.com); Postmark and SendGrid work the same way.

1. Create a Resend account and **add and verify a domain** you own (Domains → Add Domain, then add the DNS records it shows). A verified domain is required to email people other than yourself.
2. Create an API key (API Keys → Create, "Sending access").
3. In Supabase, open **Project Settings → Authentication → SMTP Settings** and turn on **Enable custom SMTP**:
   - **Sender email:** an address on your verified domain, e.g. `login@yourdomain.com`
   - **Sender name:** `SoFly`
   - **Host:** `smtp.resend.com`
   - **Port:** `465`
   - **Username:** `resend`
   - **Password:** your API key
4. Save, then request a magic link with an email that isn't yours to confirm it arrives.
5. Optional: raise the hourly cap under **Authentication → Rate Limits**, and edit the message under **Authentication → Emails → Magic Link**.

## Email templates (required for code login)

Login works two ways: the user types a 6-digit code from the email, or taps the link in it. The code works on any device or browser; the link only works in the browser that requested it (it uses the PKCE flow). Supabase's default templates contain only the link, so add the code to **both** templates under **Authentication → Emails**:

- **Magic Link** (sent to existing users)
- **Confirm signup** (sent to first-time users)

Set the subject to `Your SoFly login code` and use this body in each:

```html
<h2>Your SoFly login code</h2>
<p>Enter this code on the login page:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>Or <a href="{{ .ConfirmationURL }}">tap here to log in</a> (only works in the browser where you requested it).</p>
```

## Database

`supabase/schema.sql` is the complete, current schema: use it for any new project. The numbered files in `supabase/migrations/` are the same schema built up in steps, kept so an existing database can be upgraded. Paste only the ones you haven't run yet, in order. Run each before deploying the code that uses it. (The app keeps working in between, with one exception: after `009`, hosts can't cancel their own events until the newest code is deployed.)

| Migration | What it adds |
|---|---|
| `001_init` | events, RSVPs, profiles, and the security rules |
| `002_reports` | the "report this meetup" table |
| `003_chat_links` | group chat links, visible only to the host and guests |
| `004_cancelled` | moderator-cancelled events |
| `005_profiles_and_filters` | private birthdays; skill level, audience and age settings |
| `006_request_to_join` | approval-only events, private addresses, spot counts |
| `007_notes_and_host_controls` | intro notes on requests; hosts can cancel and change spots |
| `008_interests_and_passes` | interests picker and swipe passes |
| `009_hardening_and_cleanup` | tightened privileges, cleaner policies and functions, extra limits and indexes |
| `010_email_settings` | each person's on/off switch for SoFly's emails |
| `011_meetup_feedback` | guests' private "would you join again?" answers, shown only as totals |
| `012_men_only_audience` | lets a meetup be set for men only (as well as everyone or women only) |
| `013_push_subscriptions` | the devices that turned on push notifications |
| `014_profile_bios` | a short bio and social usernames, visible to hosts of meetups you join or ask to join |
| `015_admin_review` | lets the admin page mark a report as reviewed |
| `016_details_changed` | remembers when a detail behind a meetup's picture changed (and what it was), so people who joined earlier can be told |
| `017_update_event_details` | lets a host change the date/time and place of their own meetup, all in one step |

**Changing the database?** Update `schema.sql` and add a migration, then run `npm test`. `test:db` builds a database both ways, runs about 240 checks on each (who can see and do what), and fails if the two ever differ. `test:unit` covers ages, dates, calendar files, chat-link safety, and the email logic (who gets emailed, when, and why someone is skipped). `test:contract` reads the app's own code, finds every database call, and checks each one against the permissions the schema really grants, so a write the database would refuse fails here, not in production.

## Email notifications

SoFly emails people when: someone asks to join their approval-only meetup, a host answers a request, a meetup they were going to is cancelled, the day before a meetup they're part of, and the day after (a one-tap "how was it?"). Each person can switch them off on the Me tab. Login codes are separate and always sent.

To turn it on (all optional; without these the app works exactly as before, just without the emails):

1. Run `supabase/migrations/010_email_settings.sql`.
2. In Supabase, open **Project Settings → API** and copy the **`service_role`** key (called the secret key in newer dashboards). This key bypasses every security rule, so treat it like a password.
3. In Vercel, open **Settings → Environment Variables** and add:
   - `SUPABASE_SERVICE_ROLE_KEY`: the key from step 2. Mark it **Sensitive**.
   - `CRON_SECRET`: any long random string (run `openssl rand -hex 24`). Mark it **Sensitive**.
   - Confirm `ALERT_EMAIL_USER` and `ALERT_EMAIL_APP_PASSWORD` are set. Emails are sent from that Gmail account.
4. Redeploy. The daily job (`vercel.json`) then runs at 9am Pacific, sending reminders and feedback requests. In Vercel, **Settings → Cron Jobs** lists it and has a **Run** button to test it.

**Emails not arriving?** Don't guess; check each link:

1. Open the **Me** tab and press **Send me a test email**. It checks, in order: the mail account, the server key, that Supabase accepts the key, that your emails are switched on, that the daily-job secret exists, and that Gmail accepts a real message. A red ✗ names the exact problem, and never shows a secret. If everything is green but nothing arrives, look in spam.
2. For the daily job, open Vercel → **Logs**, filter for `/api/cron/reminders`, and find the line that starts `Daily emails:`. It reports `eventsTomorrow` (meetups it found), `reminders` (emails sent), `skipped` (people it skipped: `optedOut`, `noEmail`, `lookupFailed`), `failed` (refused by Gmail) with `firstFailure` (Gmail's reason), and a `note` if it stopped early.
3. Environment variable changes only take effect on a **new deployment**. After adding or changing one, redeploy.

Notes: emails come from your Gmail address and may land in spam at first. Gmail limits sending to a few hundred a day, and the reminder job stops at 250 per run. On Vercel's free plan a cron job can run only once a day, at some point within the scheduled hour.

## Push notifications

The same moments as the emails (a join request, a host's answer, a cancellation, the day-before reminder and the day-after "how was it?") can also arrive as a notification on a phone or computer. Each person turns it on per device on the **Me** tab, and can send themselves a test. Logging out turns it off for that device, so a shared phone never shows the last person's notifications.

To set it up (optional; without it the card doesn't appear and nothing else changes):

1. Run `supabase/migrations/013_push_subscriptions.sql`.
2. Generate your own key pair. In this project's folder run `npx web-push generate-vapid-keys`. It prints a **Public Key** and a **Private Key**. Keep the private one secret; nobody else, including me, needs to see it.
3. In Vercel → **Settings → Environment Variables**, add:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: the public key. Leave it **not** Sensitive; browsers need to read it.
   - `VAPID_PRIVATE_KEY`: the private key. Mark it **Sensitive**.
   - `VAPID_SUBJECT` (optional): `mailto:` plus your contact address. It defaults to `NEXT_PUBLIC_CONTACT_EMAIL`.
   - `SUPABASE_SERVICE_ROLE_KEY` must already be set (see Email notifications).
4. **Redeploy.** The public key is baked into the site when it's built, so it only appears after a new deployment.
5. On each device: **Me → Push notifications on this device → Turn on**, then **Send a test notification**.

**iPhone and iPad:** Apple only allows web push for sites on the Home Screen (iOS 16.4 or newer). In Safari tap Share → **Add to Home Screen**, open SoFly from that icon, then turn notifications on. The card explains this itself when it detects it.

**Nothing arrives?** The **Send a test notification** button checks each link (keys, contact address, server key, your devices, and whether the push service accepts the message) and shows which is broken. The `Daily emails:` line in Vercel's logs also reports `pushes` and `pushFailed`.

## Launch setup

- **Report email alerts:** add these in Vercel → Settings → Environment Variables (and `.env.local` locally). Mark the password **Sensitive**:
  - `ALERT_EMAIL_USER`: a Gmail address
  - `ALERT_EMAIL_APP_PASSWORD`: a Google app password ([myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)); reusing the one from Supabase SMTP is fine
  - `REPORT_ALERT_EMAIL`: where alerts go (optional; defaults to `NEXT_PUBLIC_CONTACT_EMAIL`)

  Redeploy afterward. If these aren't set, reports are still saved; only the email is skipped.

- **Contact email:** set `NEXT_PUBLIC_CONTACT_EMAIL` (locally in `.env.local`, and in Vercel → Settings → Environment Variables). It powers the Feedback link and the privacy and guidelines pages.

- **Custom domain:** set `NEXT_PUBLIC_SITE_URL` (e.g. `https://your-domain.com`) so link previews use it. Until then Vercel's production URL is used automatically.

- **Analytics:** in Vercel, open your project → **Analytics** → **Enable**. The code is already in place.

- **Link previews:** check them after deploying by pasting an event URL into the [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/). Platforms cache previews, so re-scrape after changes.

## Moderating

### The admin page

`/admin` is a private dashboard for you, with three sections:

- **Overview**: members, meetups, joins, seats filled, "would join again", push devices, a 14-day chart of new members, meetups and joins, and what people host (categories and neighborhoods). It's built from SoFly's own data. Website visits and page views are in your Vercel dashboard under Analytics.
- **Reports**: open reports first, with the meetup, the host, the reporter and their note. **Cancel meetup** cancels it (the people who joined get an email and a push notification) and closes its reports; **Mark reviewed** closes a report and leaves the meetup up. Reviewed reports can be shown again or reopened.
- **Meetups**: upcoming, past, cancelled or all, with a title search, and the same **Cancel meetup** / **Reinstate** buttons.

To turn it on:

1. Run `supabase/migrations/015_admin_review.sql` in the Supabase SQL editor.
2. Set `ADMIN_EMAILS` to the email(s) you log in to SoFly with (comma separated), in `.env.local` and in Vercel → Settings → Environment Variables, then redeploy. It's a server-only setting (no `NEXT_PUBLIC_`).
3. `SUPABASE_SERVICE_ROLE_KEY` must also be set (it already is if emails work).

Then log in as that person: an **Admin dashboard** link appears at the top of **Me**, or go to `/admin`.

How it's kept safe: only a logged-in person whose verified email is exactly in `ADMIN_EMAILS` gets in (no wildcards; matching ignores letter case). Everyone else, logged in or not, gets an ordinary "not found" page. Every button re-checks this on the server. The page shows names only, never emails, birthdays, addresses or private notes, and it isn't indexed by search engines. If `ADMIN_EMAILS` is empty, nobody is an admin.

### Or with SQL

Reports are also saved in Supabase → Table Editor → `reports`, and emailed to you if alerts are set up. Reporting never changes an event; you decide. In the Supabase **SQL editor**:

```sql
-- See open reports, newest first, with the event they're about
select r.created_at, r.reason, r.details, e.title, e.id as event_id
from public.reports r join public.events e on e.id = r.event_id
where r.reviewed_at is null
order by r.created_at desc;

-- Cancel an event (hides it from the feed, shows a "cancelled" banner, blocks new RSVPs)
update public.events set cancelled_at = now() where id = 'EVENT_ID';

-- Undo a cancellation
update public.events set cancelled_at = null where id = 'EVENT_ID';
```

Hosts can cancel their own meetups from the event page, but only you can **reinstate** one (from the admin page, or the SQL editor). Hosts can also delete their own events. **Cancelling** keeps the page up with a "cancelled" notice; **deleting** removes it completely. Either way, the people who had joined get an email and a push notification (unless the meetup already started or was already cancelled).

## Things to know

- **Browsing by date and filtering.** On both the List and Swipe tabs, a **Filters** button (next to the List/Swipe toggle, with a count of how many filters are on) opens one panel with the week calendar, the category, neighborhood and skill dropdowns, and the audience and "fits my age" chips. In the calendar, arrows move a week at a time and tapping a day shows just that day, with the number of meetups on each day. The chosen filters are in the address, so they can be shared, and they carry over when you switch tabs. Weeks run Monday to Sunday in Pacific time, up to 26 weeks ahead.
- **Light and dark mode.** The whole app has a light and a dark version, and follows the phone's or computer's own setting by default (so it flips at sunset if the device does). Under **Appearance** on **Me**, and in the footer of every page, there's an **Auto / Light / Dark** switch to override it; the choice is remembered in a cookie (`sofly_theme`) and applied on the server, so a page never flashes the wrong colours. The colours for both modes are defined in `lib/brand.ts` (`BRAND` for light, `BRAND_DARK` for dark) and become CSS variables, so screens use names like `bg-surface` and `text-ink` and switch automatically; a test fails if a fixed light colour like `bg-white` sneaks back in. The app icon, emails and link previews always use the light colours.
- **The Feed intro.** The top of the Feed says "Do more things with real people." with the sentence under it, for everyone (logged in or not); it lives in one place, `FEED_HEADLINE` / `FEED_INTRO` in `lib/site.ts`.
- **The name and logo.** The app is called SoFly, with a butterfly as its icon (drawn in code in `lib/butterfly.ts`, so it stays sharp and uses the palette; it's the favicon, the home-screen icon, the header logo (the very same deep-green tile) and part of the link previews). A few things still carry the old name because they live outside the code: the web address (`bay-meet.vercel.app`, until you rename the Vercel project or add a custom domain, and if you do, update the redirect URLs in Supabase and `NEXT_PUBLIC_SITE_URL`), the GitHub repository name, and two settings inside Supabase: the login-code email template and the SMTP sender name (see "Email templates" and "Custom SMTP" above; set both to SoFly). Icons are cached by browsers and phones for a year, so they carry a version (`ICON_REV` in `lib/brand.ts`): bump it whenever the icon changes.
- **Every meetup gets its own picture.** There are no photo uploads (so nothing to moderate): the picture is drawn from the meetup's public details. The time of day sets the sky (dawn to night, in Pacific time), the neighborhood sets the scene (Golden Gate-style bridge, painted houses in the Mission, Berkeley's Campanile, city skylines, coast, vineyards, redwoods, rolling hills), the category sets the colors and floating shapes, the skill level sets the ridge line (soft hills for beginners, jagged peaks for advanced), and the number of spots sets how many little people are standing there. The meetup's id fills in the small details, so two similar meetups still look different. It's used on the swipe card, the list cards, the meetup page, Next Up on Me, and the link preview. It's all in `lib/cover.ts`. Venues and addresses are never used, so a private address can't show up in a picture. Cancelled meetups are shown in gray. If the time, neighborhood, category, skill level or number of spots change after people have joined, a small note under the picture tells the host and everyone who joined or asked before the change what changed (for example "Spots: 10 → 8"), and says the picture was redrawn when it really looks different. (Spots changing in a way nobody can see, like 12 to 10, stays quiet.) It disappears once the meetup starts or is cancelled. This needs migration 016; without it everything else works and there's just no note.
- **Editing a meetup.** Hosts get an **Edit** button at the top of their meetup's page (until it starts or is cancelled) to change the date and time, neighborhood, venue, address and the number of spots, all in one form. (Spots can't go below the number of people already going.) The date/time and place are saved in one step, so a meetup can't end up with its new time but its old place; for approval-only meetups the private address stays private. Once a date, time or place change is saved (a change in spots alone tells nobody), everyone who had joined gets an email and a push notification saying what changed from and to (people whose request is still pending or was declined aren't told, and the push never shows the address on a lock screen). Someone who turned emails off still gets the push, and vice versa. Needs migration 017.
- **Declined requests.** If a host declines your request, it now appears on **Me** under **Declined** (with a gentle note) instead of quietly disappearing.
- **The swipe screen.** On a phone, tapping **Swipe** (top right) turns the page into a single floating card: drag right to join, left to pass, tap for details. It doesn't scroll at all; filters live behind the **Filters** button. On larger screens it's a normal page with the same card.
- **Migrations 010-017 can be run again safely.** If an earlier run stopped partway (for example with "already exists"), just run the file once more and it finishes the job.
- **The emailed link only works in the browser that requested it.** The code always works, which is why the login page asks for it.
- **Supabase's built-in email sender is heavily rate limited** (a few emails per hour, and only to project team members by default). It's fine for development. Before real users arrive, configure your own SMTP provider under **Project Settings → Authentication → SMTP Settings**.
- **Times are Pacific.** The date picker on the post form is interpreted as Pacific time regardless of the poster's device time zone, and all times are displayed in Pacific.
- **Display names** are chosen on the welcome screen right after first login (name and birthday), and can be changed by editing the row in the `profiles` table (Supabase → Table Editor). Birthdays are private and can't be changed once saved.

## Project layout

```
app/                  Pages, server actions (app/actions.ts), auth callback, icons and link-preview images
components/           UI components (cards, filters, RSVP panel, forms, nav)
lib/constants.ts      Categories, neighborhoods, badge colors
lib/time.ts           Pacific-time formatting and parsing
lib/validation.ts     Post-form rules, shared by client and server
lib/supabase/         Browser and server Supabase clients
middleware.ts         Refreshes the Supabase session cookie
supabase/schema.sql      The complete database schema (use this for a new project)
supabase/migrations/    The same schema in upgrade steps, for existing databases
supabase/tests/         `npm run test:db`: security and behaviour checks on the schema
```

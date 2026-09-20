# BayMeet

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

That one file creates every table, index, security rule and trigger the app needs. (Already have a BayMeet database from earlier? Skip this and see "Upgrading an existing database" below.)

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
4. Click **Deploy**. Note your production URL, e.g. `https://baymeet.vercel.app`.
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
   - **Sender name:** `BayMeet`
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

Set the subject to `Your BayMeet login code` and use this body in each:

```html
<h2>Your BayMeet login code</h2>
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
| `010_email_settings` | each person's on/off switch for BayMeet's emails |
| `011_meetup_feedback` | guests' private "would you join again?" answers, shown only as totals |

**Changing the database?** Update `schema.sql` and add a migration, then run `npm test`. `test:db` builds a database both ways, runs about 240 checks on each (who can see and do what), and fails if the two ever differ. `test:unit` covers ages, dates, calendar files, chat-link safety and the emails.

## Email notifications

BayMeet emails people when: someone asks to join their approval-only meetup, a host answers a request, a meetup they were going to is cancelled, the day before a meetup they're part of, and the day after (a one-tap "how was it?"). Each person can switch them off on the Me tab. Login codes are separate and always sent.

To turn it on (all optional; without these the app works exactly as before, just without the emails):

1. Run `supabase/migrations/010_email_settings.sql`.
2. In Supabase, open **Project Settings → API** and copy the **`service_role`** key (called the secret key in newer dashboards). This key bypasses every security rule, so treat it like a password.
3. In Vercel, open **Settings → Environment Variables** and add:
   - `SUPABASE_SERVICE_ROLE_KEY`: the key from step 2. Mark it **Sensitive**.
   - `CRON_SECRET`: any long random string (run `openssl rand -hex 24`). Mark it **Sensitive**.
   - Confirm `ALERT_EMAIL_USER` and `ALERT_EMAIL_APP_PASSWORD` are set. Emails are sent from that Gmail account.
4. Redeploy. The daily job (`vercel.json`) then runs at 9am Pacific, sending reminders and feedback requests. In Vercel, **Settings → Cron Jobs** lists it and has a **Run** button to test it.

Notes: emails come from your Gmail address and may land in spam at first. Gmail limits sending to a few hundred a day, and the reminder job stops at 250 per run. On Vercel's free plan a cron job can run only once a day, at some point within the scheduled hour.

## Launch setup

- **Report email alerts:** add these in Vercel → Settings → Environment Variables (and `.env.local` locally). Mark the password **Sensitive**:
  - `ALERT_EMAIL_USER`: a Gmail address
  - `ALERT_EMAIL_APP_PASSWORD`: a Google app password ([myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)); reusing the one from Supabase SMTP is fine
  - `REPORT_ALERT_EMAIL`: where alerts go (optional; defaults to `NEXT_PUBLIC_CONTACT_EMAIL`)

  Redeploy afterward. If these aren't set, reports are still saved; only the email is skipped.

- **Contact email:** set `NEXT_PUBLIC_CONTACT_EMAIL` (locally in `.env.local`, and in Vercel → Settings → Environment Variables). It powers the Feedback link and the privacy and guidelines pages.

- **Custom domain:** set `NEXT_PUBLIC_SITE_URL` (e.g. `https://baymeet.app`) so link previews use it. Until then Vercel's production URL is used automatically.

- **Analytics:** in Vercel, open your project → **Analytics** → **Enable**. The code is already in place.

- **Link previews:** check them after deploying by pasting an event URL into the [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/). Platforms cache previews, so re-scrape after changes.

## Moderating

Reports are saved in Supabase → Table Editor → `reports`, and emailed to you if alerts are set up. Reporting never changes an event; you decide. In the Supabase **SQL editor**:

```sql
-- See open reports, newest first, with the event they're about
select r.created_at, r.reason, r.details, e.title, e.id as event_id
from public.reports r join public.events e on e.id = r.event_id
order by r.created_at desc;

-- Cancel an event (hides it from the feed, shows a "cancelled" banner, blocks new RSVPs)
update public.events set cancelled_at = now() where id = 'EVENT_ID';

-- Undo a cancellation
update public.events set cancelled_at = null where id = 'EVENT_ID';
```

Hosts can cancel their own meetups from the event page, but only you can **reinstate** one, from the SQL editor or table editor. Hosts can also still delete their own events.

## Things to know

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

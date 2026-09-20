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
2. Paste the entire contents of [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql).
3. Click **Run**. You should see "Success. No rows returned."

This creates the `profiles`, `events` and `rsvps` tables, all Row Level Security policies, the trigger that creates a profile for each new user, and a trigger that stops an event from being over-booked.

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

## Launch setup

- **Reports:** run [`supabase/migrations/002_reports.sql`](supabase/migrations/002_reports.sql) in the SQL editor. Reports are private; read them in Supabase → Table Editor → `reports`.
- **Group chat links:** run [`supabase/migrations/003_chat_links.sql`](supabase/migrations/003_chat_links.sql) in the SQL editor. Hosts can add a WhatsApp, GroupMe, Discord, Telegram, Signal, Slack or Messenger invite link; only the host and people who joined can see it.
- **Birthdays, skill levels, age and audience settings:** run [`supabase/migrations/005_profiles_and_filters.sql`](supabase/migrations/005_profiles_and_filters.sql) right before deploying the matching code. After it, joining and posting require a completed profile (name and birthday), which everyone is asked for the next time they log in. Birthdays live in a private table only the owner can read, and can't be changed once saved (fix a typo in Supabase → Table Editor → `profile_private`).
- **Request-to-join events (coffee chats, dinners):** run [`supabase/migrations/006_request_to_join.sql`](supabase/migrations/006_request_to_join.sql) after 005. It's safe to run before deploying the matching code. Hosts can choose "I approve each person"; the real address stays private until they approve someone, and hosts see pending requests on the event page and as a badge on the Me tab.
- **Cancelled events:** run [`supabase/migrations/004_cancelled.sql`](supabase/migrations/004_cancelled.sql). Run it **before** deploying the matching code; the new feed query needs the column. See "Moderating" below.
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

Only you can do this (the SQL editor and table editor); hosts can't cancel or un-cancel through the app. Hosts can still delete their own events.

## Things to know

- **The emailed link only works in the browser that requested it.** The code always works, which is why the login page asks for it.
- **Supabase's built-in email sender is heavily rate limited** (a few emails per hour, and only to project team members by default). It's fine for development. Before real users arrive, configure your own SMTP provider under **Project Settings → Authentication → SMTP Settings**.
- **Times are Pacific.** The date picker on the post form is interpreted as Pacific time regardless of the poster's device time zone, and all times are displayed in Pacific.
- **Display names** come from the optional "Your name" field on the login page, used only when an email signs up for the first time. If it's left blank, the name defaults to the part of the email before the `@`. There's no profile editor; change a name by editing the row in the `profiles` table (Supabase → Table Editor).

## Project layout

```
app/                  Pages, server actions (app/actions.ts), auth callback, icons and link-preview images
components/           UI components (cards, filters, RSVP panel, forms, nav)
lib/constants.ts      Categories, neighborhoods, badge colors
lib/time.ts           Pacific-time formatting and parsing
lib/validation.ts     Post-form rules, shared by client and server
lib/supabase/         Browser and server Supabase clients
middleware.ts         Refreshes the Supabase session cookie
supabase/migrations/  SQL schema, RLS policies, triggers
```

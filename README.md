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

To try it: go to **Me** → enter your email → click the link in the email (in the same browser) → **Post** a meetup.

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

## Things to know

- **Open the magic link in the same browser** you requested it from. Login uses the PKCE flow, which stores a one-time verifier in the browser that asked for the link.
- **Supabase's built-in email sender is heavily rate limited** (a few emails per hour, and only to project team members by default). It's fine for development. Before real users arrive, configure your own SMTP provider under **Project Settings → Authentication → SMTP Settings**.
- **Times are Pacific.** The date picker on the post form is interpreted as Pacific time regardless of the poster's device time zone, and all times are displayed in Pacific.
- **Display names** default to the part of the email before the `@`. There's no profile editor; a user can change it by updating their row in `profiles`.

## Project layout

```
app/                  Pages, server actions (app/actions.ts), auth callback
components/           UI components (cards, filters, RSVP panel, forms, nav)
lib/constants.ts      Categories, neighborhoods, badge colors
lib/time.ts           Pacific-time formatting and parsing
lib/validation.ts     Post-form rules, shared by client and server
lib/supabase/         Browser and server Supabase clients
middleware.ts         Refreshes the Supabase session cookie
supabase/migrations/  SQL schema, RLS policies, triggers
```

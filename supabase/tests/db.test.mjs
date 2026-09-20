// Database tests. Run with `npm run test:db`.
//
// Builds the database two ways (every migration in order, and schema.sql) in an in-memory
// Postgres, runs the same behaviour checks against both, then fails if the two builds differ in
// any table, constraint, index, policy, function, trigger or privilege.
//
// Postgres here is PGlite (real Postgres compiled to WebAssembly). Supabase's `auth` schema and
// its `anon` / `authenticated` roles are stood in for below, including Supabase's habit of
// granting new tables to both roles by default, which schema.sql then takes away.

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SQL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = fs.readdirSync(path.join(SQL_DIR, "migrations")).filter((f) => f.endsWith(".sql")).sort();
const read = (...p) => fs.readFileSync(path.join(SQL_DIR, ...p), "utf8");

let passed = 0;
let failed = 0;
let label = "";
const ok = (name, cond, extra = "") => {
  cond ? passed++ : failed++;
  console.log(`${cond ? "ok   " : "FAIL "}[${label}] ${name}${cond ? "" : "  -> " + extra}`);
};

async function newDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
  `);
  return db;
}

const NAMES = ["host", "ann", "bob", "cy", "dee", "kid"];
async function addUsers(db) {
  const U = {};
  for (const n of NAMES) {
    U[n] = (await db.query(`insert into auth.users (email) values ($1) returning id`, [`${n}@x.com`])).rows[0].id;
  }
  return U;
}

/** Every migration in order, with a pre-existing event and RSVPs from before 005 to prove the upgrades keep data. */
async function buildFromMigrations() {
  const db = await newDb();
  const U = await addUsers(db); // 001 backfills profiles for these
  let oldEvent = null;
  for (const file of MIGRATIONS) {
    if (file.startsWith("005")) {
      oldEvent = (await db.query(
        `insert into public.events (host_id,title,category,venue_name,address,neighborhood,starts_at,max_spots)
         values ($1,'Old event','Yoga','Park','1 Main St','Oakland','2027-02-01T20:00:00Z',5) returning id`, [U.host]
      )).rows[0].id;
      await db.query(`insert into public.rsvps (event_id,user_id) values ($1,$2),($1,$3)`, [oldEvent, U.ann, U.bob]);
    }
    try { await db.exec(read("migrations", file)); }
    catch (e) { console.log(`MIGRATION FAILED ${file}: ${e.message}`); process.exit(1); }
  }
  return { db, U, oldEvent };
}

async function buildFromSchema() {
  const db = await newDb();
  try { await db.exec(read("schema.sql")); }
  catch (e) { console.log(`schema.sql FAILED: ${e.message}`); process.exit(1); }
  const U = await addUsers(db); // the auth trigger creates the profiles
  return { db, U, oldEvent: null };
}

// ───────────────────────────── behaviour ─────────────────────────────

async function behaviour({ db, U, oldEvent }, { migrated }) {
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const one = async (sql, params) => (await q(sql, params))[0];

  /** Run one statement as a person (or anon, or the dashboard/moderator = "postgres"). */
  async function as(who, sql, params) {
    const role = who === "anon" ? "anon" : who === "postgres" ? null : "authenticated";
    try {
      if (role) await db.exec(`set role ${role}; select set_config('test.uid','${who === "anon" ? "" : U[who]}',false);`);
      const r = await db.query(sql, params);
      return { rows: r.rows, n: r.affectedRows ?? r.rows.length };
    } catch (e) { return { error: e.message }; }
    finally { await db.exec(`reset role; select set_config('test.uid','',false);`); }
  }
  const failsWith = (r, text) => Boolean(r.error && r.error.toLowerCase().includes(text.toLowerCase()));
  const denied = (r) => failsWith(r, "permission denied");
  const sees = (r) => r.rows?.length ?? 0;

  if (migrated) {
    ok("upgrade kept existing events", (await one(`select spots_taken from public.events where id=$1`, [oldEvent])).spots_taken === 2);
    ok("upgrade kept existing rsvps as approved", (await one(`select count(*)::int c from public.rsvps where status='approved'`)).c === 2);
  }

  // ---- profiles, birthdays ----
  ok("a profile is created for every user", (await one(`select count(*)::int c from public.profiles`)).c === NAMES.length);
  let r = await as("host", `insert into public.events (host_id,title,category,venue_name,address,neighborhood,starts_at,max_spots) values ($1,'x','Yoga','v','a','Oakland','2027-01-15T20:00:00Z',3)`, [U.host]);
  ok("no birthday -> cannot post an event", !!r.error, JSON.stringify(r));
  r = await as("kid", `insert into public.profile_private (user_id,birth_date) values ($1,'2012-01-01')`, [U.kid]);
  ok("under-18 birthday rejected", failsWith(r, "18 or older"), JSON.stringify(r));
  const bdays = { host: "1990-01-01", ann: "2000-06-15", bob: "2005-03-01", cy: "1995-05-05", dee: "1988-08-08" };
  for (const [n, d] of Object.entries(bdays)) {
    r = await as(n, `insert into public.profile_private (user_id,birth_date) values ($1,$2)`, [U[n], d]);
    if (r.error) ok(`birthday saved for ${n}`, false, r.error);
  }
  r = await as("ann", `update public.profile_private set birth_date='2001-01-01' where user_id=$1`, [U.ann]);
  ok("a birthday cannot be changed once set", !!r.error || r.n === 0, JSON.stringify(r));
  r = await as("ann", `delete from public.profile_private where user_id=$1`, [U.ann]);
  ok("a birthday cannot be deleted", !!r.error || r.n === 0, JSON.stringify(r));
  r = await as("ann", `select birth_date from public.profile_private`);
  ok("users see only their own birthday", sees(r) === 1, JSON.stringify(r));
  r = await as("anon", `select * from public.profile_private`);
  ok("anon cannot read birthdays", !!r.error || sees(r) === 0, JSON.stringify(r));

  r = await as("ann", `update public.profiles set name='Ann A' where id=$1`, [U.ann]);
  ok("a user can rename themselves", !r.error && r.n === 1, JSON.stringify(r));
  r = await as("bob", `update public.profiles set name='Hijacked' where id=$1`, [U.ann]);
  ok("a user cannot rename someone else", !!r.error || r.n === 0, JSON.stringify(r));
  r = await as("ann", `update public.profiles set created_at=now() where id=$1`, [U.ann]);
  ok("profile columns other than name are read-only", denied(r), JSON.stringify(r));
  r = await as("ann", `update public.profiles set name=$2 where id=$1`, [U.ann, "x".repeat(51)]);
  ok("names over 50 characters rejected", !!r.error, JSON.stringify(r));
  r = await as("anon", `update public.profiles set name='x'`);
  ok("anon cannot edit profiles", !!r.error || r.n === 0, JSON.stringify(r));

  // ---- posting, limits ----
  const mkEvent = async (who, f) => {
    const res = await as(who, `insert into public.events (host_id,title,category,venue_name,address,neighborhood,starts_at,max_spots,join_mode,age_min,age_max)
      values ($1,$2,'Dinner',$3,$4,'Oakland','2027-01-15T20:00:00Z',$5,$6,$7,$8) returning id`,
      [U[who], f.title, f.venue ?? "Public venue", f.addr ?? "Public addr", f.max, f.mode ?? "open", f.amin ?? null, f.amax ?? null]);
    if (res.error) { ok(`create event ${f.title}`, false, res.error); return null; }
    return res.rows[0].id;
  };
  const E1 = await mkEvent("host", { title: "open", max: 2 });
  ok("host with a birthday can post", !!E1);
  r = await as("host", `insert into public.events (host_id,title,category,venue_name,address,neighborhood,starts_at,max_spots) values ($1,'x','Yoga','v','a','Oakland','2027-01-15T20:00:00Z',500)`, [U.host]);
  ok("max spots over 200 rejected on insert", failsWith(r, "events_max_spots_range"), JSON.stringify(r));
  r = await as("host", `insert into public.events (host_id,title,category,venue_name,address,neighborhood,starts_at,max_spots) values ($1,$2,'Yoga','v','a','Oakland','2027-01-15T20:00:00Z',5)`, [U.host, "t".repeat(101)]);
  ok("titles over 100 characters rejected", failsWith(r, "events_title_length"), JSON.stringify(r));
  r = await as("host", `insert into public.events (host_id,title,category,description,venue_name,address,neighborhood,starts_at,max_spots) values ($1,'x','Yoga',$2,'v','a','Oakland','2027-01-15T20:00:00Z',5)`, [U.host, "d".repeat(1001)]);
  ok("descriptions over 1000 characters rejected", failsWith(r, "events_description_length"), JSON.stringify(r));
  r = await as("host", `insert into public.events (host_id,title,category,venue_name,address,neighborhood,starts_at,max_spots) values ($1,'','Yoga','v','a','Oakland','2027-01-15T20:00:00Z',5)`, [U.host]);
  ok("empty titles rejected", !!r.error, JSON.stringify(r));
  r = await as("ann", `insert into public.events (host_id,title,category,venue_name,address,neighborhood,starts_at,max_spots) values ($1,'x','Yoga','v','a','Oakland','2027-01-15T20:00:00Z',5)`, [U.host]);
  ok("cannot post an event as someone else", !!r.error, JSON.stringify(r));
  r = await as("anon", `insert into public.events (host_id,title,category,venue_name,address,neighborhood,starts_at,max_spots) values ($1,'x','Yoga','v','a','Oakland','2027-01-15T20:00:00Z',5)`, [U.host]);
  ok("anon cannot post", !!r.error, JSON.stringify(r));

  // ---- open events: joining, capacity ----
  r = await as("ann", `insert into public.rsvps (event_id,user_id) values ($1,$2) returning status`, [E1, U.ann]);
  ok("open event: join is approved instantly", r.rows?.[0]?.status === "approved", JSON.stringify(r));
  await as("bob", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E1, U.bob]);
  ok("spots_taken tracks joins", (await one(`select spots_taken from public.events where id=$1`, [E1])).spots_taken === 2);
  r = await as("cy", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E1, U.cy]);
  ok("a full event rejects joins", failsWith(r, "full"), JSON.stringify(r));
  r = await as("anon", `select user_id from public.rsvps where event_id=$1`, [E1]);
  ok("anyone can see who joined an open event", sees(r) === 2, JSON.stringify(r));
  r = await as("kid", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E1, U.kid]);
  ok("no birthday -> cannot join", !!r.error, JSON.stringify(r));
  r = await as("ann", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E1, U.bob]);
  ok("cannot RSVP as someone else", !!r.error, JSON.stringify(r));
  r = await as("anon", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E1, U.cy]);
  ok("anon cannot join", !!r.error, JSON.stringify(r));
  await as("ann", `delete from public.rsvps where event_id=$1 and user_id=$2`, [E1, U.ann]);
  ok("leaving frees the spot", (await one(`select spots_taken from public.events where id=$1`, [E1])).spots_taken === 1);

  // ---- age requirements (event on 2027-01-15: ann is 26, bob 21, dee 38) ----
  const E2 = await mkEvent("host", { title: "21-25", max: 5, amin: 21, amax: 25 });
  r = await as("bob", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E2, U.bob]);
  ok("age 21 can join 21-25", !r.error, JSON.stringify(r));
  r = await as("ann", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E2, U.ann]);
  ok("age 26 blocked from 21-25", failsWith(r, "age requirement"), JSON.stringify(r));
  r = await as("dee", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E2, U.dee]);
  ok("age 38 blocked from 21-25", failsWith(r, "age requirement"), JSON.stringify(r));

  // ---- audience and custom age ranges (event on 2027-01-15: ann is 26, bob 21, cy 31, dee 38) ----
  const insertAudience = (audience) => as("host", `insert into public.events (host_id,title,category,venue_name,address,neighborhood,starts_at,max_spots,audience) values ($1,'aud','Yoga','v','a','Oakland','2027-01-15T20:00:00Z',5,$2) returning id`, [U.host, audience]);
  for (const a of ["Everyone", "Women-only", "Men-only"]) {
    r = await insertAudience(a);
    ok(`an event can be set for "${a}"`, !r.error, JSON.stringify(r));
  }
  r = await insertAudience("Nonbinary-only");
  ok("any other audience is rejected", failsWith(r, "events_audience_check"), JSON.stringify(r));
  r = await as("host", `update public.events set audience='Men-only' where id=$1`, [E1]);
  ok("a host can change who an event is for", !r.error && r.n === 1, JSON.stringify(r));

  const E30_35 = await mkEvent("host", { title: "30-35", max: 5, amin: 30, amax: 35 });
  r = await as("cy", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E30_35, U.cy]);
  ok("custom range 30-35: a 31-year-old can join", !r.error, JSON.stringify(r));
  r = await as("ann", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E30_35, U.ann]);
  ok("...a 26-year-old cannot", failsWith(r, "age requirement"), JSON.stringify(r));
  r = await as("dee", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E30_35, U.dee]);
  ok("...and a 38-year-old cannot", failsWith(r, "age requirement"), JSON.stringify(r));
  const E26 = await mkEvent("host", { title: "26 exactly", max: 5, amin: 26, amax: 26 });
  r = await as("ann", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E26, U.ann]);
  ok("a single-age range (26 to 26) admits exactly that age", !r.error, JSON.stringify(r));
  r = await as("cy", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E26, U.cy]);
  ok("...and nobody else", failsWith(r, "age requirement"), JSON.stringify(r));
  const E_ONLY_MAX = await mkEvent("host", { title: "18-30", max: 5, amin: 18, amax: 30 });
  r = await as("bob", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E_ONLY_MAX, U.bob]);
  ok("an 18-to-30 range admits a 21-year-old", !r.error, JSON.stringify(r));
  r = await as("cy", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E_ONLY_MAX, U.cy]);
  ok("...but not a 31-year-old", failsWith(r, "age requirement"), JSON.stringify(r));
  r = await as("host", `insert into public.events (host_id,title,category,venue_name,address,neighborhood,starts_at,max_spots,age_min,age_max) values ($1,'x','Yoga','v','a','Oakland','2027-01-15T20:00:00Z',5,40,30)`, [U.host]);
  ok("a range where the oldest is below the youngest is rejected", failsWith(r, "events_age_range_check"), JSON.stringify(r));
  r = await as("host", `insert into public.events (host_id,title,category,venue_name,address,neighborhood,starts_at,max_spots,age_min) values ($1,'x','Yoga','v','a','Oakland','2027-01-15T20:00:00Z',5,17)`, [U.host]);
  ok("a minimum under 18 is rejected", failsWith(r, "events_age_range_check"), JSON.stringify(r));

  // ---- request to join ----
  const E3 = await mkEvent("host", { title: "dinner", max: 2, mode: "request", venue: "Shared after approval", addr: "Oakland" });
  await as("host", `insert into public.event_locations (event_id,venue_name,address) values ($1,'Secret Bistro','99 Hidden Ln')`, [E3]);
  r = await as("ann", `insert into public.rsvps (event_id,user_id,status) values ($1,$2,'approved')`, [E3, U.ann]);
  ok("a client cannot choose its own status", denied(r), JSON.stringify(r));
  r = await as("ann", `insert into public.rsvps (event_id,user_id) values ($1,$2) returning status`, [E3, U.ann]);
  ok("request event: joining creates a pending request", r.rows?.[0]?.status === "pending", JSON.stringify(r));
  await as("bob", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E3, U.bob]);
  await as("cy", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E3, U.cy]);
  ok("pending requests don't use up spots", (await one(`select spots_taken from public.events where id=$1`, [E3])).spots_taken === 0);
  r = await as("cy", `select user_id from public.rsvps where event_id=$1`, [E3]);
  ok("a requester sees only their own request", sees(r) === 1 && r.rows[0].user_id === U.cy, JSON.stringify(r));
  r = await as("anon", `select * from public.rsvps where event_id=$1`, [E3]);
  ok("anon sees no requests", sees(r) === 0, JSON.stringify(r));
  r = await as("host", `select user_id,status from public.rsvps where event_id=$1`, [E3]);
  ok("the host sees every request", sees(r) === 3 && r.rows.every((x) => x.status === "pending"), JSON.stringify(r));
  r = await as("ann", `update public.rsvps set status='approved' where event_id=$1 and user_id=$2`, [E3, U.ann]);
  ok("a requester cannot approve themselves", !!r.error || r.n === 0, JSON.stringify(r));
  ok("...and stays pending", (await one(`select status from public.rsvps where event_id=$1 and user_id=$2`, [E3, U.ann])).status === "pending");
  r = await as("bob", `update public.rsvps set status='approved' where event_id=$1 and user_id=$2`, [E3, U.ann]);
  ok("another user cannot approve someone", !!r.error || r.n === 0, JSON.stringify(r));
  r = await as("host", `update public.rsvps set status='approved' where event_id=$1 and user_id=$2`, [E3, U.ann]);
  ok("the host approves a request", !r.error && r.n === 1, JSON.stringify(r));
  await as("host", `update public.rsvps set status='approved' where event_id=$1 and user_id=$2`, [E3, U.bob]);
  ok("spots_taken counts approved people only", (await one(`select spots_taken from public.events where id=$1`, [E3])).spots_taken === 2);
  r = await as("host", `update public.rsvps set status='approved' where event_id=$1 and user_id=$2`, [E3, U.cy]);
  ok("the host cannot approve past capacity", failsWith(r, "full"), JSON.stringify(r));
  r = await as("host", `update public.rsvps set status='declined' where event_id=$1 and user_id=$2`, [E3, U.cy]);
  ok("the host declines a request", !r.error && r.n === 1, JSON.stringify(r));
  r = await as("host", `update public.rsvps set user_id=$2 where event_id=$1 and user_id=$3`, [E3, U.dee, U.cy]);
  ok("the host can change only the status, not the person", denied(r), JSON.stringify(r));
  r = await as("cy", `select status from public.rsvps where event_id=$1`, [E3]);
  ok("a declined person sees their status", r.rows?.[0]?.status === "declined", JSON.stringify(r));
  r = await as("ann", `select user_id from public.rsvps where event_id=$1`, [E3]);
  ok("approved guests see the other approved guests", sees(r) === 2, JSON.stringify(r));
  r = await as("dee", `select user_id from public.rsvps where event_id=$1`, [E3]);
  ok("outsiders see nobody on a request event", sees(r) === 0, JSON.stringify(r));
  r = await as("host", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E3, U.host]);
  ok("a full event is full even for the host", failsWith(r, "full"), JSON.stringify(r));

  // ---- private location ----
  for (const [who, why] of [["anon", "anon"], ["dee", "outsiders"], ["cy", "declined people"]]) {
    r = await as(who, `select * from public.event_locations`);
    ok(`${why} cannot read private locations`, !!r.error || sees(r) === 0, JSON.stringify(r));
  }
  r = await as("ann", `select address from public.event_locations`);
  ok("approved guests can read the location", r.rows?.[0]?.address === "99 Hidden Ln", JSON.stringify(r));
  r = await as("host", `select address from public.event_locations`);
  ok("the host can read the location", sees(r) === 1, JSON.stringify(r));
  r = await as("dee", `insert into public.event_locations (event_id,venue_name,address) values ($1,'x','y')`, [E1]);
  ok("a non-host cannot add a location", !!r.error, JSON.stringify(r));
  r = await as("anon", `select venue_name,address from public.events where id=$1`, [E3]);
  ok("the public event row holds only the placeholder", r.rows?.[0]?.venue_name === "Shared after approval" && r.rows[0].address === "Oakland", JSON.stringify(r));

  // ---- chat links ----
  await as("host", `insert into public.event_chat_links (event_id,url) values ($1,'https://chat.whatsapp.com/abc')`, [E3]);
  r = await as("ann", `select url from public.event_chat_links where event_id=$1`, [E3]);
  ok("approved guests see the chat link", sees(r) === 1, JSON.stringify(r));
  r = await as("dee", `select url from public.event_chat_links where event_id=$1`, [E3]);
  ok("outsiders don't see the chat link", sees(r) === 0, JSON.stringify(r));
  r = await as("host", `insert into public.event_chat_links (event_id,url) values ($1,'https://evil.example/x')`, [E1]);
  ok("chat links must come from a known app", !!r.error, JSON.stringify(r));
  r = await as("host", `insert into public.event_chat_links (event_id,url) values ($1,'https://chat.whatsapp.com@evil.com/x')`, [E1]);
  ok("...including look-alike hosts", !!r.error, JSON.stringify(r));
  r = await as("dee", `insert into public.event_chat_links (event_id,url) values ($1,'https://chat.whatsapp.com/x')`, [E1]);
  ok("a non-host cannot add a chat link", !!r.error, JSON.stringify(r));
  const E4 = await mkEvent("host", { title: "dinner2", max: 3, mode: "request" });
  await as("host", `insert into public.event_chat_links (event_id,url) values ($1,'https://chat.whatsapp.com/def')`, [E4]);
  await as("dee", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E4, U.dee]);
  r = await as("dee", `select url from public.event_chat_links where event_id=$1`, [E4]);
  ok("a pending requester cannot see the chat link", sees(r) === 0, JSON.stringify(r));
  r = await as("host", `insert into public.rsvps (event_id,user_id) values ($1,$2) returning status`, [E4, U.host]);
  ok("the host joining their own request event is auto-approved", r.rows?.[0]?.status === "approved", JSON.stringify(r));

  // ---- host controls ----
  const E5 = await mkEvent("host", { title: "host-managed", max: 4 });
  await as("ann", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E5, U.ann]);
  await as("bob", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E5, U.bob]);
  r = await as("host", `update public.events set max_spots=6 where id=$1`, [E5]);
  ok("host can raise max spots", !r.error && r.n === 1, JSON.stringify(r));
  r = await as("host", `update public.events set max_spots=2 where id=$1`, [E5]);
  ok("host can lower max spots to the number going", !r.error && r.n === 1, JSON.stringify(r));
  r = await as("host", `update public.events set max_spots=1 where id=$1`, [E5]);
  ok("host cannot go below the number going", failsWith(r, "events_spots_within_capacity"), JSON.stringify(r));
  r = await as("host", `update public.events set max_spots=201 where id=$1`, [E5]);
  ok("host cannot exceed 200 spots", failsWith(r, "events_max_spots_range"), JSON.stringify(r));
  r = await as("host", `update public.events set max_spots=0 where id=$1`, [E5]);
  ok("host cannot set zero spots", !!r.error, JSON.stringify(r));
  r = await as("ann", `update public.events set max_spots=50 where id=$1`, [E5]);
  ok("a non-host cannot change max spots", !!r.error || r.n === 0, JSON.stringify(r));
  for (const [col, val] of [["spots_taken", "0"], ["join_mode", "'request'"], ["host_id", `'${U.ann}'`], ["cancelled_at", "null"], ["created_at", "now()"]]) {
    r = await as("host", `update public.events set ${col}=${val} where id=$1`, [E5]);
    ok(`host cannot write events.${col}`, denied(r), JSON.stringify(r));
  }
  r = await as("host", `update public.events set title='renamed' where id=$1`, [E5]);
  ok("host can still edit ordinary fields", !r.error && r.n === 1, JSON.stringify(r));

  r = await as("ann", `select public.cancel_event($1)`, [E5]);
  ok("a non-host cannot cancel someone's event", failsWith(r, "own active events"), JSON.stringify(r));
  r = await as("anon", `select public.cancel_event($1)`, [E5]);
  ok("anon cannot call cancel_event", !!r.error, JSON.stringify(r));
  r = await as("host", `select public.cancel_event($1)`, [E5]);
  ok("host can cancel their own event", !r.error && (await one(`select cancelled_at from public.events where id=$1`, [E5])).cancelled_at !== null, JSON.stringify(r));
  r = await as("host", `select public.cancel_event($1)`, [E5]);
  ok("cancelling twice is rejected", !!r.error, JSON.stringify(r));
  r = await as("host", `update public.events set cancelled_at=null where id=$1`, [E5]);
  ok("host cannot reinstate a cancelled event", denied(r), JSON.stringify(r));
  r = await as("host", `update public.events set cancelled_at=now() + interval '1 day' where id=$1`, [E5]);
  ok("host cannot alter a cancellation", denied(r), JSON.stringify(r));
  r = await as("cy", `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E5, U.cy]);
  ok("a cancelled event blocks joining", failsWith(r, "cancelled"), JSON.stringify(r));
  r = await as("postgres", `update public.events set cancelled_at=null where id=$1`, [E5]);
  ok("a moderator (dashboard) can reinstate", !r.error, JSON.stringify(r));
  r = await as("postgres", `update public.events set cancelled_at=now() where id=$1`, [E1]);
  ok("a moderator (dashboard) can cancel", !r.error, JSON.stringify(r));
  r = await as("host", `insert into public.events (host_id,title,category,venue_name,address,neighborhood,starts_at,max_spots,spots_taken) values ($1,'x','Yoga','v','a','Oakland','2027-01-15T20:00:00Z',3,2)`, [U.host]);
  ok("cannot create an event with a fake spots_taken", denied(r), JSON.stringify(r));
  r = await as("host", `insert into public.events (host_id,title,category,venue_name,address,neighborhood,starts_at,max_spots,cancelled_at) values ($1,'x','Yoga','v','a','Oakland','2027-01-15T20:00:00Z',3,now())`, [U.host]);
  ok("cannot create an already-cancelled event", denied(r), JSON.stringify(r));

  // ---- notes on requests ----
  const E6 = await mkEvent("host", { title: "notes dinner", max: 3, mode: "request" });
  for (const n of ["ann", "bob", "cy"]) await as(n, `insert into public.rsvps (event_id,user_id) values ($1,$2)`, [E6, U[n]]);
  r = await as("ann", `insert into public.rsvp_notes (event_id,user_id,note) values ($1,$2,'Hi! I am Ann, new to the area and love long dinners.')`, [E6, U.ann]);
  ok("a requester can add a note", !r.error, JSON.stringify(r));
  await as("bob", `insert into public.rsvp_notes (event_id,user_id,note) values ($1,$2,'Bob here, a chef.')`, [E6, U.bob]);
  r = await as("cy", `insert into public.rsvp_notes (event_id,user_id,note) values ($1,$2,'Cy: grad student.')`, [E6, U.ann]);
  ok("cannot write a note as someone else", !!r.error, JSON.stringify(r));
  r = await as("dee", `insert into public.rsvp_notes (event_id,user_id,note) values ($1,$2,'I never requested')`, [E6, U.dee]);
  ok("cannot add a note without a request", !!r.error, JSON.stringify(r));
  r = await as("ann", `insert into public.rsvp_notes (event_id,user_id,note) values ($1,$2,'again')`, [E6, U.ann]);
  ok("only one note per request", !!r.error, JSON.stringify(r));
  r = await as("cy", `insert into public.rsvp_notes (event_id,user_id,note) values ($1,$2,$3)`, [E6, U.cy, "x".repeat(501)]);
  ok("notes over 500 characters rejected", !!r.error, JSON.stringify(r));
  r = await as("host", `select user_id from public.rsvp_notes where event_id=$1`, [E6]);
  ok("the host reads every note", sees(r) === 2, JSON.stringify(r));
  r = await as("ann", `select user_id from public.rsvp_notes where event_id=$1`, [E6]);
  ok("a requester sees only their own note", sees(r) === 1 && r.rows[0].user_id === U.ann, JSON.stringify(r));
  await as("host", `update public.rsvps set status='approved' where event_id=$1 and user_id=$2`, [E6, U.ann]);
  r = await as("ann", `select user_id from public.rsvp_notes where event_id=$1`, [E6]);
  ok("an approved guest still sees only their own note", sees(r) === 1, JSON.stringify(r));
  r = await as("anon", `select * from public.rsvp_notes`);
  ok("anon cannot read notes", !!r.error || sees(r) === 0, JSON.stringify(r));
  r = await as("bob", `update public.rsvp_notes set note='changed' where event_id=$1`, [E6]);
  ok("notes cannot be edited", !!r.error || r.n === 0, JSON.stringify(r));
  await as("bob", `delete from public.rsvps where event_id=$1 and user_id=$2`, [E6, U.bob]);
  ok("cancelling a request deletes its note", (await one(`select count(*)::int c from public.rsvp_notes where event_id=$1 and user_id=$2`, [E6, U.bob])).c === 0);

  // ---- interests, passes, reports ----
  r = await as("ann", `insert into public.user_interests (user_id,categories) values ($1,'{Running,Dinner}')`, [U.ann]);
  ok("a user can save interests", !r.error, JSON.stringify(r));
  r = await as("ann", `update public.user_interests set categories='{Music}', updated_at=now() where user_id=$1 returning user_id`, [U.ann]);
  ok("a user can change their saved interests", !r.error && sees(r) === 1, JSON.stringify(r));
  // This is the statement shape Supabase generates for .upsert(): it rewrites the key column too.
  const postgrestUpsert = (table, cols, vals, key) =>
    `insert into public.${table} (${cols}) values (${vals}) on conflict (${key}) do update set ${cols.split(",").map((c) => `${c.trim()} = excluded.${c.trim()}`).join(", ")}`;
  r = await as("ann", postgrestUpsert("user_interests", "user_id, categories, updated_at", `'${U.ann}', '{Yoga}', now()`, "user_id"));
  ok("a PostgREST-style upsert on interests is refused (the app updates, then inserts)", denied(r), JSON.stringify(r));
  r = await as("cy", `insert into public.user_interests (user_id,categories) values ($1,'{Yoga}')`, [U.ann]);
  ok("cannot save interests for someone else", !!r.error, JSON.stringify(r));
  r = await as("bob", `select * from public.user_interests`);
  ok("interests are private", sees(r) === 0, JSON.stringify(r));
  r = await as("anon", `select * from public.user_interests`);
  ok("anon cannot read interests", !!r.error || sees(r) === 0, JSON.stringify(r));

  r = await as("ann", `insert into public.user_settings (user_id,email_notifications) values ($1,false)`, [U.ann]);
  ok("a user can turn email notifications off", !r.error, JSON.stringify(r));
  r = await as("ann", `update public.user_settings set email_notifications=true, updated_at=now() where user_id=$1 returning user_id`, [U.ann]);
  ok("...and back on", !r.error && sees(r) === 1, JSON.stringify(r));
  r = await as("ann", postgrestUpsert("user_settings", "user_id, email_notifications, updated_at", `'${U.ann}', false, now()`, "user_id"));
  ok("a PostgREST-style upsert on settings is refused too", denied(r), JSON.stringify(r));
  r = await as("cy", `insert into public.user_settings (user_id,email_notifications) values ($1,false)`, [U.ann]);
  ok("cannot change someone else's email settings", !!r.error, JSON.stringify(r));
  r = await as("bob", `select * from public.user_settings`);
  ok("email settings are private", sees(r) === 0, JSON.stringify(r));
  r = await as("anon", `select * from public.user_settings`);
  ok("anon cannot read email settings", !!r.error || sees(r) === 0, JSON.stringify(r));

  // ---- push subscriptions (devices that turned on push notifications) ----
  // The server adds these with the service key (the "postgres" role stands in for it here).
  await db.query(`insert into public.push_subscriptions (user_id,endpoint,p256dh,auth) values ($1,'https://push.example/ann-phone','key1','auth1'),($1,'https://push.example/ann-laptop','key2','auth2'),($2,'https://push.example/bob-phone','key3','auth3')`, [U.ann, U.bob]);
  r = await as("ann", `select endpoint from public.push_subscriptions order by endpoint`);
  ok("a person sees only their own devices", sees(r) === 2 && r.rows.every((x) => x.endpoint.includes("ann")), JSON.stringify(r));
  r = await as("anon", `select * from public.push_subscriptions`);
  ok("anon cannot see anyone's devices", !!r.error || sees(r) === 0, JSON.stringify(r));
  r = await as("ann", `insert into public.push_subscriptions (user_id,endpoint,p256dh,auth) values ($1,'https://push.example/fake','k','a')`, [U.ann]);
  ok("a client cannot add a device itself (only the server can)", denied(r), JSON.stringify(r));
  r = await as("ann", `update public.push_subscriptions set user_id=$1 where endpoint='https://push.example/ann-phone'`, [U.bob]);
  ok("a device cannot be handed to someone else", denied(r), JSON.stringify(r));
  r = await as("bob", `delete from public.push_subscriptions where endpoint='https://push.example/ann-phone'`);
  ok("nobody can remove someone else's device", !!r.error || r.n === 0, JSON.stringify(r));
  r = await as("ann", `delete from public.push_subscriptions where endpoint='https://push.example/ann-laptop'`);
  ok("a person can turn off one of their own devices", !r.error && r.n === 1, JSON.stringify(r));
  r = await as("postgres", `insert into public.push_subscriptions (user_id,endpoint,p256dh,auth) values ($1,'https://push.example/ann-phone','x','y')`, [U.ann]);
  ok("the same device can't be registered twice", !!r.error, JSON.stringify(r));
  r = await as("postgres", `insert into public.push_subscriptions (user_id,endpoint,p256dh,auth) values ($1,$2,'x','y')`, [U.ann, "https://push.example/" + "x".repeat(2000)]);
  ok("absurdly long device addresses are rejected", !!r.error, JSON.stringify(r));

  const EP = await mkEvent("host", { title: "pass me", max: 5 });
  r = await as("ann", `insert into public.event_passes (user_id,event_id) values ($1,$2)`, [U.ann, EP]);
  ok("a user can pass on an event", !r.error, JSON.stringify(r));
  r = await as("bob", `insert into public.event_passes (user_id,event_id) values ($1,$2)`, [U.ann, EP]);
  ok("cannot pass on behalf of someone else", !!r.error, JSON.stringify(r));
  r = await as("bob", `select * from public.event_passes`);
  ok("passes are private", sees(r) === 0, JSON.stringify(r));
  r = await as("ann", `delete from public.event_passes where event_id=$1`, [EP]);
  ok("a user can undo a pass", !r.error && r.n === 1, JSON.stringify(r));

  r = await as("ann", `insert into public.reports (event_id,reporter_id,reason,details) values ($1,$2,'Spam or scam','looks fake')`, [EP, U.ann]);
  ok("a user can file a report", !r.error, JSON.stringify(r));
  r = await as("ann", `insert into public.reports (event_id,reporter_id,reason) values ($1,$2,'Spam or scam')`, [EP, U.ann]);
  ok("...but only once per event", !!r.error, JSON.stringify(r));
  r = await as("bob", `insert into public.reports (event_id,reporter_id,reason) values ($1,$2,'Other')`, [EP, U.ann]);
  ok("cannot report as someone else", !!r.error, JSON.stringify(r));
  r = await as("ann", `select * from public.reports`);
  ok("reporters cannot read reports back", !!r.error || sees(r) === 0, JSON.stringify(r));
  r = await as("anon", `insert into public.reports (event_id,reporter_id,reason) values ($1,$2,'Other')`, [EP, U.ann]);
  ok("anon cannot report", !!r.error, JSON.stringify(r));
  r = await as("cy", `insert into public.reports (event_id,reporter_id,reason,details) values ($1,$2,'Other',$3)`, [EP, U.cy, "d".repeat(501)]);
  ok("report details over 500 characters rejected", !!r.error, JSON.stringify(r));

  // ---- meetup feedback ("would you join again?") ----
  const mkPast = async (title, mode = "open") =>
    (await one(`insert into public.events (host_id,title,category,venue_name,address,neighborhood,starts_at,max_spots,join_mode)
      values ($1,$2,'Yoga','v','a','Oakland','2020-01-01T20:00:00Z',10,$3) returning id`, [U.host, title, mode])).id;
  const PAST = await mkPast("past meetup");
  await db.query(`insert into public.rsvps (event_id,user_id) values ($1,$2),($1,$3)`, [PAST, U.ann, U.bob]);
  const totals = async (id) => one(`select feedback_yes y, feedback_total t from public.events where id=$1`, [id]);

  r = await as("ann", `insert into public.meetup_feedback (event_id,user_id,would_join_again) values ($1,$2,true)`, [PAST, U.ann]);
  ok("a guest can give feedback once the meetup has started", !r.error, JSON.stringify(r));
  await as("bob", `insert into public.meetup_feedback (event_id,user_id,would_join_again) values ($1,$2,false)`, [PAST, U.bob]);
  const t1 = await totals(PAST);
  ok("the public totals add up (1 yes of 2)", t1.y === 1 && t1.t === 2, JSON.stringify(t1));
  r = await as("bob", `update public.meetup_feedback set would_join_again=true where event_id=$1 and user_id=$2`, [PAST, U.bob]);
  const t2 = await totals(PAST);
  ok("a guest can change their answer, and the totals follow", !r.error && t2.y === 2 && t2.t === 2, JSON.stringify(t2));
  r = await as("ann", `insert into public.meetup_feedback (event_id,user_id,would_join_again) values ($1,$2,false)`, [PAST, U.ann]);
  ok("only one answer per guest", !!r.error, JSON.stringify(r));
  r = await as("ann", postgrestUpsert("meetup_feedback", "event_id, user_id, would_join_again", `'${PAST}', '${U.ann}', false`, "event_id, user_id"));
  ok("a PostgREST-style upsert on feedback is refused", denied(r), JSON.stringify(r));
  r = await as("ann", `update public.meetup_feedback set event_id=$2 where event_id=$1 and user_id=$3`, [PAST, E2, U.ann]);
  ok("a guest cannot move their answer to a different meetup", denied(r), JSON.stringify(r));
  r = await as("cy", `insert into public.meetup_feedback (event_id,user_id,would_join_again) values ($1,$2,true)`, [PAST, U.cy]);
  ok("someone who never joined cannot rate", failsWith(r, "Only guests who joined"), JSON.stringify(r));
  r = await as("host", `insert into public.meetup_feedback (event_id,user_id,would_join_again) values ($1,$2,true)`, [PAST, U.host]);
  ok("the host cannot rate their own meetup", failsWith(r, "own meetup"), JSON.stringify(r));
  r = await as("ann", `insert into public.meetup_feedback (event_id,user_id,would_join_again) values ($1,$2,true)`, [E2, U.ann]);
  ok("nobody can rate a meetup that hasn't happened yet", !!r.error, JSON.stringify(r));
  r = await as("bob", `insert into public.meetup_feedback (event_id,user_id,would_join_again) values ($1,$2,true)`, [E2, U.bob]);
  ok("...even a guest who has joined it", failsWith(r, "once the meetup has started"), JSON.stringify(r));
  r = await as("ann", `insert into public.meetup_feedback (event_id,user_id,would_join_again) values ($1,$2,true)`, [PAST, U.bob]);
  ok("cannot answer on someone else's behalf", !!r.error, JSON.stringify(r));

  const PAST_REQ = await mkPast("past dinner", "request");
  await db.query(`insert into public.rsvps (event_id,user_id) values ($1,$2),($1,$3)`, [PAST_REQ, U.cy, U.dee]);
  await db.query(`update public.rsvps set status='declined' where event_id=$1 and user_id=$2`, [PAST_REQ, U.dee]);
  r = await as("cy", `insert into public.meetup_feedback (event_id,user_id,would_join_again) values ($1,$2,true)`, [PAST_REQ, U.cy]);
  ok("a pending request cannot rate", failsWith(r, "Only guests who joined"), JSON.stringify(r));
  r = await as("dee", `insert into public.meetup_feedback (event_id,user_id,would_join_again) values ($1,$2,true)`, [PAST_REQ, U.dee]);
  ok("a declined request cannot rate", failsWith(r, "Only guests who joined"), JSON.stringify(r));

  const PAST_CANCELLED = await mkPast("past but cancelled");
  await db.query(`insert into public.rsvps (event_id,user_id) values ($1,$2)`, [PAST_CANCELLED, U.ann]);
  await db.query(`update public.events set cancelled_at=now() where id=$1`, [PAST_CANCELLED]);
  r = await as("ann", `insert into public.meetup_feedback (event_id,user_id,would_join_again) values ($1,$2,true)`, [PAST_CANCELLED, U.ann]);
  ok("a cancelled meetup cannot be rated", failsWith(r, "cancelled"), JSON.stringify(r));

  r = await as("ann", `select * from public.meetup_feedback`);
  ok("a guest sees only their own answer", sees(r) === 1 && r.rows[0].user_id === U.ann, JSON.stringify(r));
  r = await as("host", `select * from public.meetup_feedback`);
  ok("the host cannot see individual answers", !!r.error || sees(r) === 0, JSON.stringify(r));
  r = await as("anon", `select * from public.meetup_feedback`);
  ok("anon cannot see answers", !!r.error || sees(r) === 0, JSON.stringify(r));
  r = await as("anon", `select feedback_yes, feedback_total from public.events where id=$1`, [PAST]);
  ok("...but the public totals are visible", !r.error && r.rows[0].feedback_total === 2, JSON.stringify(r));
  for (const [col, val] of [["feedback_yes", "9"], ["feedback_total", "9"]]) {
    r = await as("host", `update public.events set ${col}=${val} where id=$1`, [PAST]);
    ok(`the host cannot edit events.${col}`, denied(r), JSON.stringify(r));
  }
  r = await as("ann", `delete from public.meetup_feedback where event_id=$1`, [PAST]);
  const t3 = await totals(PAST);
  ok("a guest can withdraw their answer, and the totals follow", !r.error && t3.t === 1 && t3.y === 1, JSON.stringify(t3));
  await db.query(`delete from public.events where id=$1`, [PAST]);
  ok("deleting an event removes its feedback", (await one(`select count(*)::int c from public.meetup_feedback where event_id=$1`, [PAST])).c === 0);

  // ---- cleanup and cascades ----
  await as("host", `delete from public.events where id=$1`, [EP]);
  ok("deleting an event clears its passes and reports", (await one(`select (select count(*) from public.event_passes where event_id=$1) + (select count(*) from public.reports where event_id=$1) as c`, [EP])).c == 0);
  r = await as("host", `delete from public.events where id=$1`, [E3]);
  ok("deleting an event works (rsvps, location cascade)", !r.error, JSON.stringify(r));
  ok("...and leaves no orphans", (await one(`select (select count(*) from public.rsvps where event_id=$1) + (select count(*) from public.event_locations where event_id=$1) as c`, [E3])).c == 0);
  r = await as("ann", `delete from public.events where id=$1`, [E5]);
  ok("a non-host cannot delete an event", !!r.error || r.n === 0, JSON.stringify(r));
}

// ───────────────────────────── the two builds must match ─────────────────────────────

async function catalog(db) {
  const rows = async (sql) => (await db.query(sql)).rows.map((r) => r.x);
  const lines = [];
  const add = async (kind, sql) => (await rows(sql)).forEach((x) => lines.push(`${kind}: ${x}`));

  // Column order and constraint/index NAMES can legitimately differ (ALTER TABLE ... ADD COLUMN
  // vs. one CREATE TABLE), so they're left out. Everything that changes behaviour is compared.
  await add("column", `select table_name||'.'||column_name||' '||data_type||' null='||is_nullable||' default='||coalesce(column_default,'') x
    from information_schema.columns where table_schema='public'`);
  await add("constraint", `select conrelid::regclass::text||' '||contype::text||' '||pg_get_constraintdef(oid) x
    from pg_constraint where connamespace='public'::regnamespace`);
  await add("index", `select regexp_replace(indexdef, 'INDEX \\S+ ON', 'INDEX ON') x from pg_indexes where schemaname='public'`);
  await add("rls", `select relname||' rls='||relrowsecurity x from pg_class where relnamespace='public'::regnamespace and relkind='r'`);
  await add("policy", `select tablename||' | '||policyname||' | '||cmd||' | '||roles::text||' | '||coalesce(qual,'')||' | '||coalesce(with_check,'') x
    from pg_policies where schemaname='public'`);
  await add("function", `select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||') secdef='||p.prosecdef||' '||regexp_replace(pg_get_functiondef(p.oid), '\\s+', ' ', 'g') x
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')`);
  await add("trigger", `select event_object_schema||'.'||event_object_table||' '||trigger_name||' '||action_timing||' '||event_manipulation||' '||action_statement x
    from information_schema.triggers where trigger_schema in ('public','auth')`);
  await add("table grant", `select grantee||' '||table_name||' '||privilege_type x from information_schema.role_table_grants
    where table_schema='public' and grantee in ('anon','authenticated')`);
  await add("column grant", `select grantee||' '||table_name||'.'||column_name||' '||privilege_type x from information_schema.column_privileges
    where table_schema='public' and grantee in ('anon','authenticated')`);
  await add("function grant", `select grantee||' '||routine_schema||'.'||routine_name x from information_schema.routine_privileges
    where routine_schema in ('public','private') and grantee in ('anon','authenticated','PUBLIC')`);
  return lines.sort();
}

// ───────────────────────────── run ─────────────────────────────

label = "migrations";
const fromMigrations = await buildFromMigrations();
console.log(`built from ${MIGRATIONS.length} migrations (${MIGRATIONS[0]} ... ${MIGRATIONS.at(-1)})`);
await behaviour(fromMigrations, { migrated: true });

label = "schema.sql";
const fromSchema = await buildFromSchema();
console.log("built from schema.sql");
await behaviour(fromSchema, { migrated: false });

label = "drift";
const a = await catalog((await buildFromMigrations()).db);
const b = await catalog((await buildFromSchema()).db);
const onlyA = a.filter((x) => !b.includes(x));
const onlyB = b.filter((x) => !a.includes(x));
ok(`migrations and schema.sql agree (${a.length} schema facts compared)`, onlyA.length === 0 && onlyB.length === 0);
onlyA.forEach((x) => console.log("  only in migrations: " + x.slice(0, 220)));
onlyB.forEach((x) => console.log("  only in schema.sql: " + x.slice(0, 220)));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

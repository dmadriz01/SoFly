// The three numbers that say whether SoFly is working as a marketplace, worked out from plain rows
// (so they can be tested without a database). Definitions are deliberately strict and written down
// here, so the number means the same thing every time you look at it.
//
//   1. Meetups that reached a minimum crowd: of the meetups that happened in the last 90 days, how many had
//      the host plus at least 2 guests. (An empty room is the way people give up on a new app.)
//   2. Week-4 guest return: of people whose FIRST meetup was at least 28 days ago, how many went to another
//      one within 28 days of it.
//   3. Hosts who post again: of hosts whose first post is at least 14 days old, how many have posted a
//      second, separate time. (A weekly series posted in one go counts as ONE post.)

const DAY = 24 * 60 * 60 * 1000;
export const MIN_GUESTS = 2;
export const CROWD_WINDOW_DAYS = 90;
export const RETURN_WINDOW_DAYS = 28;
export const HOST_WAIT_DAYS = 14;

export type HealthEvent = {
  id: string;
  host_id: string;
  starts_at: string;
  created_at: string;
  cancelled_at: string | null;
  /** Ties the dates of a recurring meetup together. Absent on databases from before recurring meetups. */
  series_id?: string | null;
};
export type HealthRsvp = { user_id: string; event_id: string; status: string };

export type Ratio = {
  /** How many were counted. */
  of: number;
  /** How many of them did the thing. */
  yes: number;
  /** 0-100, or null when nobody can be counted yet. */
  percent: number | null;
};

export type Health = {
  crowd: Ratio & { minGuests: number; windowDays: number };
  /** Guests: `of` = people old enough to judge, `waiting` = people whose first meetup is too recent to tell. */
  guestReturn: Ratio & { waiting: number; windowDays: number; firstTimers: number; repeatEver: number };
  /** Hosts: `of` = hosts old enough to judge, `waiting` = hosts whose first post is too recent to tell. */
  hostAgain: Ratio & { waiting: number; waitDays: number; hosts: number; withSeries: number };
};

const ratio = (yes: number, of: number): Ratio => ({ of, yes, percent: of > 0 ? Math.round((yes / of) * 100) : null });

export function computeHealth(input: { now: Date; events: HealthEvent[]; rsvps: HealthRsvp[] }): Health {
  const { now, events, rsvps } = input;
  const t = (iso: string) => new Date(iso).getTime();
  const eventById = new Map(events.map((e) => [e.id, e]));
  const held = (e: HealthEvent) => !e.cancelled_at && t(e.starts_at) <= now.getTime();

  // Guests are approved people who aren't the host of that meetup (a host's own row isn't someone joining).
  const guestRows = rsvps.filter((r) => {
    const e = eventById.get(r.event_id);
    return r.status === "approved" && e !== undefined && r.user_id !== e.host_id;
  });

  // 1. Meetups that reached a minimum crowd
  const guestsAt = new Map<string, number>();
  for (const r of guestRows) guestsAt.set(r.event_id, (guestsAt.get(r.event_id) ?? 0) + 1);
  const recent = events.filter((e) => held(e) && now.getTime() - t(e.starts_at) < CROWD_WINDOW_DAYS * DAY);
  const crowd = ratio(recent.filter((e) => (guestsAt.get(e.id) ?? 0) >= MIN_GUESTS).length, recent.length);

  // 2. Guests coming back
  const wentTo = new Map<string, number[]>(); // person -> when they went to meetups that happened, oldest first
  for (const r of guestRows) {
    const e = eventById.get(r.event_id)!;
    if (!held(e)) continue;
    wentTo.set(r.user_id, [...(wentTo.get(r.user_id) ?? []), t(e.starts_at)]);
  }
  let judged = 0, returned = 0, waiting = 0, repeatEver = 0;
  for (const times of Array.from(wentTo.values())) {
    times.sort((a, b) => a - b);
    if (times.length >= 2) repeatEver++;
    const first = times[0];
    if (now.getTime() - first < RETURN_WINDOW_DAYS * DAY) {
      waiting++;
      continue;
    }
    judged++;
    if (times.some((x) => x > first && x - first <= RETURN_WINDOW_DAYS * DAY)) returned++;
  }
  const guestReturn = { ...ratio(returned, judged), waiting, windowDays: RETURN_WINDOW_DAYS, firstTimers: wentTo.size, repeatEver };

  // 3. Hosts who post again. A "post" is one form submission: a whole series is one post.
  type Post = { createdAt: number; dates: number };
  const postsOf = new Map<string, Map<string, Post>>(); // host -> post key -> post
  for (const e of events) {
    if (e.cancelled_at) continue; // a cancelled meetup isn't a post that happened
    const key = e.series_id ?? e.id;
    const posts = postsOf.get(e.host_id) ?? new Map<string, Post>();
    const post = posts.get(key) ?? { createdAt: t(e.created_at), dates: 0 };
    post.createdAt = Math.min(post.createdAt, t(e.created_at));
    post.dates += 1;
    posts.set(key, post);
    postsOf.set(e.host_id, posts);
  }
  let hostJudged = 0, hostAgain = 0, hostWaiting = 0, withSeries = 0;
  for (const posts of Array.from(postsOf.values())) {
    const list = Array.from(posts.values());
    if (list.some((p) => p.dates > 1)) withSeries++;
    const firstPost = Math.min(...list.map((p) => p.createdAt));
    if (now.getTime() - firstPost < HOST_WAIT_DAYS * DAY) {
      hostWaiting++;
      continue;
    }
    hostJudged++;
    if (list.length >= 2) hostAgain++;
  }
  const hostAgainStat = { ...ratio(hostAgain, hostJudged), waiting: hostWaiting, waitDays: HOST_WAIT_DAYS, hosts: postsOf.size, withSeries };

  return { crowd: { ...crowd, minGuests: MIN_GUESTS, windowDays: CROWD_WINDOW_DAYS }, guestReturn, hostAgain: hostAgainStat };
}

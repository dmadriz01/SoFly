// Light milestones: small, honest markers of progress ("your first meetup", "tried 3 kinds", "brought a
// friend"). They're worked out from what has really happened, on the spot, and stored nowhere, so they
// can never get out of step with the facts. No points, no rankings, no streaks to lose.

export type Went = { starts_at: string; category: string; neighborhood: string };
export type Ran = { starts_at: string };

export type MilestoneInput = {
  /** Meetups they attended: approved, not cancelled, already over, hosted by someone else. */
  attended: Went[];
  /** Meetups they hosted that already happened (not cancelled). */
  hosted: Ran[];
  /** Friends who joined because of their invite. */
  friendsBrought: number;
};

export type Milestone = {
  id: string;
  emoji: string;
  title: string;
  blurb: string;
  achieved: boolean;
  /** When it was reached, if we can tell. */
  achievedAt: string | null;
  current: number;
  target: number;
};

const byTime = <T extends { starts_at: string }>(list: T[]) => [...list].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

/** The date when a running count first reached `target`, walking the meetups in order. */
function reachedAt<T extends { starts_at: string }>(sorted: T[], target: number, key?: (x: T) => string): string | null {
  if (!key) return sorted.length >= target ? sorted[target - 1].starts_at : null;
  const seen = new Set<string>();
  for (const item of sorted) {
    seen.add(key(item));
    if (seen.size >= target) return item.starts_at;
  }
  return null;
}

function make(id: string, emoji: string, title: string, blurb: string, current: number, target: number, achievedAt: string | null): Milestone {
  return { id, emoji, title, blurb, achieved: current >= target, achievedAt: current >= target ? achievedAt : null, current: Math.min(current, target), target };
}

export function computeMilestones(input: MilestoneInput): Milestone[] {
  const went = byTime(input.attended);
  const ran = byTime(input.hosted);
  const categories = new Set(went.map((w) => w.category)).size;
  const neighborhoods = new Set(went.map((w) => w.neighborhood)).size;
  const n = went.length;
  const h = ran.length;
  const f = Math.max(0, Math.floor(input.friendsBrought));
  return [
    make("first-meetup", "🎉", "First meetup", "You went to your first meetup.", n, 1, reachedAt(went, 1)),
    make("regular", "🔁", "Regular", "You've been to 3 meetups.", n, 3, reachedAt(went, 3)),
    make("high-five", "🙌", "High five", "You've been to 5 meetups.", n, 5, reachedAt(went, 5)),
    make("local", "🏡", "Local", "You've been to 10 meetups.", n, 10, reachedAt(went, 10)),
    make("explorer", "🧭", "Explorer", "You've tried 3 different kinds of meetup.", categories, 3, reachedAt(went, 3, (w) => w.category)),
    make("around-the-bay", "🌉", "Around the Bay", "You've been to meetups in 3 different neighborhoods.", neighborhoods, 3, reachedAt(went, 3, (w) => w.neighborhood)),
    make("first-host", "🎤", "Host", "You hosted a meetup.", h, 1, reachedAt(ran, 1)),
    make("regular-host", "🏆", "Regular host", "You've hosted 5 meetups.", h, 5, reachedAt(ran, 5)),
    make("connector", "🤝", "Connector", "A friend joined because you invited them.", f, 1, null),
    make("butterfly", "🦋", "Social butterfly", "3 friends have joined because you invited them.", f, 3, null),
  ];
}

/** The unfinished goal they're closest to (the biggest share done), so the next step always feels near. */
export function nextMilestone(list: Milestone[]): Milestone | null {
  const open = list.filter((m) => !m.achieved);
  if (open.length === 0) return null;
  return [...open].sort((a, b) => b.current / b.target - a.current / a.target)[0];
}

/** Reached in the last week (only when we know when). */
export function isNewlyReached(m: Milestone, now = new Date(), days = 7): boolean {
  if (!m.achieved || !m.achievedAt) return false;
  const age = now.getTime() - new Date(m.achievedAt).getTime();
  return age >= 0 && age <= days * 86400000;
}

/** "2 more meetups to Regular". */
export function untilText(m: Milestone): string {
  const left = m.target - m.current;
  const noun: Record<string, [string, string]> = {
    "first-meetup": ["meetup", "meetups"], regular: ["meetup", "meetups"], "high-five": ["meetup", "meetups"], local: ["meetup", "meetups"],
    explorer: ["new kind of meetup", "new kinds of meetup"], "around-the-bay": ["new neighborhood", "new neighborhoods"],
    "first-host": ["meetup to host", "meetups to host"], "regular-host": ["more meetup to host", "more meetups to host"],
    connector: ["friend to invite", "friends to invite"], butterfly: ["more friend to invite", "more friends to invite"],
  };
  const [one, many] = noun[m.id] ?? ["more", "more"];
  return `${left} ${left === 1 ? one : many} to ${m.title}`;
}

// ───────── getting started ─────────

export type Step = { id: string; label: string; done: boolean; href: string };

/** The first-steps checklist for someone who hasn't been to a meetup yet. */
export function onboardingSteps(a: { hasInterests: boolean; hasAbout: boolean; hasJoined: boolean }): Step[] {
  return [
    { id: "interests", label: "Pick what you're into", done: a.hasInterests, href: "/me#interests" },
    { id: "about", label: "Add a line about you (hosts like it)", done: a.hasAbout, href: "/me#about" },
    { id: "join", label: "Join your first meetup", done: a.hasJoined, href: "/" },
  ];
}

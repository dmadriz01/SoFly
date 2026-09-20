export type EventRow = {
  id: string;
  host_id: string;
  title: string;
  category: string;
  description: string;
  venue_name: string;
  address: string;
  neighborhood: string;
  starts_at: string;
  max_spots: number;
  created_at: string;
  skill_level: string;
  audience: string;
  /** Age range, inclusive. null/null = anyone 18+. */
  age_min: number | null;
  age_max: number | null;
  /** Set by a moderator in Supabase; null for active events. */
  cancelled_at: string | null;
};

/** An event row selected with `rsvps(count)`. */
export type EventWithCount = EventRow & { rsvps: { count: number }[] };

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
  join_mode: "open" | "request";
  /** Approved people only. Maintained by the database. */
  spots_taken: number;
  /** Guests who said they'd join again, and how many answered. Public totals only. */
  feedback_yes: number;
  feedback_total: number;
  skill_level: string;
  audience: string;
  /** Age range, inclusive. null/null = anyone 18+. */
  age_min: number | null;
  age_max: number | null;
  /** Set by a moderator in Supabase; null for active events. */
  cancelled_at: string | null;
  /** When a detail behind the cover picture last changed, and what those details were before. */
  details_changed_at?: string | null;
  details_before?: Record<string, unknown> | null;
  /** Recurring meetups: the dates in one series share a series_id. Null for a one-off. */
  series_id?: string | null;
  /** Days between dates in the series (7 or 14). */
  repeat_every?: number | null;
};

/** Kept as an alias: spots_taken now lives on the event row itself. */
export type EventWithCount = EventRow;

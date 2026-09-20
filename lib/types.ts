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
};

/** Kept as an alias: spots_taken now lives on the event row itself. */
export type EventWithCount = EventRow;

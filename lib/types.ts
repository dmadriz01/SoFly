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
};

/** An event row selected with `rsvps(count)`. */
export type EventWithCount = EventRow & { rsvps: { count: number }[] };

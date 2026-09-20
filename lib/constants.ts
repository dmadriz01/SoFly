export const CATEGORIES = [
  "Basketball",
  "Soccer",
  "Pickleball",
  "Tennis",
  "Running",
  "Hiking",
  "Cycling",
  "Volleyball",
  "Climbing",
  "Board Games",
  "Video Games",
  "Yoga",
  "Swimming",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const NEIGHBORHOODS = [
  "SF - Mission",
  "SF - Marina",
  "SF - Sunset",
  "SF - SoMa",
  "SF - Richmond",
  "SF - Presidio",
  "Oakland",
  "Berkeley",
  "Alameda",
  "San Mateo",
  "Palo Alto",
  "Mountain View",
  "San Jose",
  "Sunnyvale",
  "Marin",
  "Other",
] as const;

export type Neighborhood = (typeof NEIGHBORHOODS)[number];

// Full class strings so Tailwind's scanner picks them up.
export const CATEGORY_STYLES: Record<Category, string> = {
  Basketball: "bg-amber-100 text-amber-900",
  Soccer: "bg-green-100 text-green-900",
  Pickleball: "bg-lime-100 text-lime-900",
  Tennis: "bg-yellow-100 text-yellow-900",
  Running: "bg-sky-100 text-sky-900",
  Hiking: "bg-emerald-100 text-emerald-900",
  Cycling: "bg-teal-100 text-teal-900",
  Volleyball: "bg-rose-100 text-rose-900",
  Climbing: "bg-stone-200 text-stone-800",
  "Board Games": "bg-violet-100 text-violet-900",
  "Video Games": "bg-indigo-100 text-indigo-900",
  Yoga: "bg-pink-100 text-pink-900",
  Swimming: "bg-cyan-100 text-cyan-900",
  Other: "bg-slate-100 text-slate-700",
};

export const isCategory = (v: unknown): v is Category =>
  typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);

export const isNeighborhood = (v: unknown): v is Neighborhood =>
  typeof v === "string" && (NEIGHBORHOODS as readonly string[]).includes(v);

export const REPORT_REASONS = [
  "Spam or scam",
  "Unsafe or inappropriate",
  "Fake or misleading",
  "Other",
] as const;

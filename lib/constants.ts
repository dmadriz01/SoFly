// Grouped for the post form's dropdown; the feed's filter pills use the flat CATEGORIES list.
export const CATEGORY_GROUPS = [
  {
    label: "Sports & fitness",
    items: [
      "Basketball",
      "Soccer",
      "Pickleball",
      "Tennis",
      "Running",
      "Hiking",
      "Cycling",
      "Volleyball",
      "Climbing",
      "Yoga",
      "Swimming",
      "Dance",
    ],
  },
  { label: "Games", items: ["Board Games", "Video Games"] },
  {
    label: "Social & interests",
    items: [
      "Coffee Chat",
      "Dinner",
      "Conversation",
      "Book Club",
      "Language Exchange",
      "Networking",
      "Food & Drink",
      "Music",
      "Arts & Crafts",
      "Photography",
      "Volunteering",
    ],
  },
  { label: "Other", items: ["Other"] },
] as const;

export type Category = (typeof CATEGORY_GROUPS)[number]["items"][number];

export const CATEGORIES: readonly Category[] = CATEGORY_GROUPS.flatMap((g) => g.items);

export const SKILL_LEVELS = ["All levels", "Beginner", "Intermediate", "Advanced"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const AUDIENCES = ["Everyone", "Women-only", "Men-only"] as const;
export type Audience = (typeof AUDIENCES)[number];

// Existing values ("SF - Mission", "Oakland", "Marin", ...) are kept exactly so older events
// still match. Cities are the 100 incorporated Bay Area cities outside San Francisco, by county.
export const NEIGHBORHOOD_GROUPS: { label: string; items: string[] }[] = [
  {
    label: "San Francisco",
    items: [
      "SF - Mission",
      "SF - Marina",
      "SF - Sunset",
      "SF - SoMa",
      "SF - Richmond",
      "SF - Presidio",
      "SF - Other",
    ],
  },
  {
    label: "East Bay",
    items: [
      "Alameda", "Albany", "Antioch", "Berkeley", "Brentwood", "Clayton", "Concord", "Danville",
      "Dublin", "El Cerrito", "Emeryville", "Fremont", "Hayward", "Hercules", "Lafayette",
      "Livermore", "Martinez", "Moraga", "Newark", "Oakland", "Oakley", "Orinda", "Piedmont",
      "Pinole", "Pittsburg", "Pleasant Hill", "Pleasanton", "Richmond", "San Leandro", "San Pablo",
      "San Ramon", "Union City", "Walnut Creek",
    ],
  },
  {
    label: "Peninsula",
    items: [
      "Atherton", "Belmont", "Brisbane", "Burlingame", "Colma", "Daly City", "East Palo Alto",
      "Foster City", "Half Moon Bay", "Hillsborough", "Menlo Park", "Millbrae", "Pacifica",
      "Portola Valley", "Redwood City", "San Bruno", "San Carlos", "San Mateo",
      "South San Francisco", "Woodside",
    ],
  },
  {
    label: "South Bay",
    items: [
      "Campbell", "Cupertino", "Gilroy", "Los Altos", "Los Altos Hills", "Los Gatos", "Milpitas",
      "Monte Sereno", "Morgan Hill", "Mountain View", "Palo Alto", "San Jose", "Santa Clara",
      "Saratoga", "Sunnyvale",
    ],
  },
  {
    label: "North Bay",
    items: [
      "Marin", "American Canyon", "Belvedere", "Benicia", "Calistoga", "Cloverdale",
      "Corte Madera", "Cotati", "Dixon", "Fairfax", "Fairfield", "Healdsburg", "Larkspur",
      "Mill Valley", "Napa", "Novato", "Petaluma", "Rio Vista", "Rohnert Park", "Ross",
      "San Anselmo", "San Rafael", "Santa Rosa", "Sausalito", "Sebastopol", "Sonoma",
      "St. Helena", "Suisun City", "Tiburon", "Vacaville", "Vallejo", "Windsor", "Yountville",
    ],
  },
  { label: "Elsewhere", items: ["Other"] },
];

export const NEIGHBORHOODS: string[] = NEIGHBORHOOD_GROUPS.flatMap((g) => g.items);

export type Neighborhood = string;

// Full class strings so Tailwind's scanner picks them up.
export const CATEGORY_STYLES: Record<Category, string> = {
  Basketball: "bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-200",
  Soccer: "bg-green-100 text-green-900 dark:bg-green-400/20 dark:text-green-200",
  Pickleball: "bg-lime-100 text-lime-900 dark:bg-lime-400/20 dark:text-lime-200",
  Tennis: "bg-yellow-100 text-yellow-900 dark:bg-yellow-400/20 dark:text-yellow-200",
  Running: "bg-sky-100 text-sky-900 dark:bg-sky-400/20 dark:text-sky-200",
  Hiking: "bg-emerald-100 text-emerald-900 dark:bg-emerald-400/20 dark:text-emerald-200",
  Cycling: "bg-teal-100 text-teal-900 dark:bg-teal-400/20 dark:text-teal-200",
  Volleyball: "bg-rose-100 text-rose-900 dark:bg-rose-400/20 dark:text-rose-200",
  Climbing: "bg-stone-200 text-stone-800 dark:bg-stone-400/20 dark:text-stone-200",
  Yoga: "bg-pink-100 text-pink-900 dark:bg-pink-400/20 dark:text-pink-200",
  Swimming: "bg-cyan-100 text-cyan-900 dark:bg-cyan-400/20 dark:text-cyan-200",
  Dance: "bg-purple-200 text-purple-900 dark:bg-purple-400/20 dark:text-purple-200",
  "Board Games": "bg-violet-100 text-violet-900 dark:bg-violet-400/20 dark:text-violet-200",
  "Video Games": "bg-indigo-100 text-indigo-900 dark:bg-indigo-400/20 dark:text-indigo-200",
  "Coffee Chat": "bg-amber-200 text-amber-950 dark:bg-amber-400/20 dark:text-amber-200",
  Dinner: "bg-red-200 text-red-950 dark:bg-red-400/20 dark:text-red-200",
  Conversation: "bg-orange-100 text-orange-900 dark:bg-orange-400/20 dark:text-orange-200",
  "Book Club": "bg-purple-100 text-purple-900 dark:bg-purple-400/20 dark:text-purple-200",
  "Language Exchange": "bg-blue-100 text-blue-900 dark:bg-blue-400/20 dark:text-blue-200",
  Networking: "bg-zinc-200 text-zinc-800 dark:bg-zinc-400/20 dark:text-zinc-200",
  "Food & Drink": "bg-red-100 text-red-900 dark:bg-red-400/20 dark:text-red-200",
  Music: "bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-400/20 dark:text-fuchsia-200",
  "Arts & Crafts": "bg-neutral-200 text-neutral-800 dark:bg-neutral-400/20 dark:text-neutral-200",
  Photography: "bg-gray-200 text-gray-800 dark:bg-gray-400/20 dark:text-gray-200",
  Volunteering: "bg-green-200 text-green-950 dark:bg-green-400/20 dark:text-green-200",
  Other: "bg-slate-100 text-slate-700 dark:bg-slate-400/20 dark:text-slate-200",
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

export const isSkillLevel = (v: unknown): v is SkillLevel =>
  typeof v === "string" && (SKILL_LEVELS as readonly string[]).includes(v);

export const isAudience = (v: unknown): v is Audience =>
  typeof v === "string" && (AUDIENCES as readonly string[]).includes(v);


export const JOIN_MODES = ["open", "request"] as const;
export type JoinMode = (typeof JOIN_MODES)[number];
export const isJoinMode = (v: unknown): v is JoinMode =>
  typeof v === "string" && (JOIN_MODES as readonly string[]).includes(v);

/** Categories where "I approve each person" is preselected on the post form. */
export const REQUEST_BY_DEFAULT: readonly string[] = ["Coffee Chat", "Dinner"];

/** What the public sees in place of the venue and address on request-to-join events. */
export const HIDDEN_VENUE = "Shared after approval";

export const CATEGORY_EMOJI: Record<Category, string> = {
  Basketball: "🏀",
  Soccer: "⚽",
  Pickleball: "🏓",
  Tennis: "🎾",
  Running: "🏃",
  Hiking: "🥾",
  Cycling: "🚴",
  Volleyball: "🏐",
  Climbing: "🧗",
  Yoga: "🧘",
  Swimming: "🏊",
  Dance: "💃",
  "Board Games": "🎲",
  "Video Games": "🎮",
  "Coffee Chat": "☕",
  Dinner: "🍽️",
  Conversation: "💬",
  "Book Club": "📚",
  "Language Exchange": "🗣️",
  Networking: "🤝",
  "Food & Drink": "🍻",
  Music: "🎵",
  "Arts & Crafts": "🎨",
  Photography: "📷",
  Volunteering: "🌱",
  Other: "✨",
};

export const emojiFor = (category: string) => (isCategory(category) ? CATEGORY_EMOJI[category] : "✨");

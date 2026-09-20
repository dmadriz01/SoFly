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

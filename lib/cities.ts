// The cities SoFly runs in. To open a new one: add it here with its neighborhoods, give every
// neighborhood a scene in lib/cover.ts (a test fails until you do), and make sure
// supabase/migrations/020_cities_and_activities.sql has been run. With one city, the app behaves
// exactly as a single-city app: no city picker anywhere and no city filtering.

export type CityGroup = { label: string; items: string[] };
export type City = {
  /** Stable id stored on meetups and in settings. Never change it once people use it. */
  id: string;
  name: string;
  /** IANA time zone. Everything is Pacific today: see the note on `timezone` in tests/cities.test.mts. */
  timezone: string;
  groups: CityGroup[];
};

// Existing values ("SF - Mission", "Oakland", "Marin", ...) are kept exactly so older events
// still match. Cities are the 100 incorporated Bay Area cities outside San Francisco, by county.
const BAY_AREA_GROUPS: CityGroup[] = [
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


export const CITIES: readonly City[] = [
  { id: "sf-bay-area", name: "San Francisco Bay Area", timezone: "America/Los_Angeles", groups: BAY_AREA_GROUPS },
];

/** Every meetup and person that existed before cities were added belongs here (the database default is the same id). */
export const DEFAULT_CITY_ID: string = CITIES[0].id;

/** Whether there's more than one city to choose between. With one, no city controls are shown. */
export const isMultiCity = (cities: readonly City[] = CITIES) => cities.length > 1;

export const cityById = (id: unknown, cities: readonly City[] = CITIES): City | undefined =>
  typeof id === "string" ? cities.find((c) => c.id === id) : undefined;

export const isCityId = (id: unknown, cities: readonly City[] = CITIES): id is string => Boolean(cityById(id, cities));

/** The city with that id, or the first city if it's missing or unknown. */
export const cityOrDefault = (id: unknown, cities: readonly City[] = CITIES): City => cityById(id, cities) ?? cities[0];

export const neighborhoodsOf = (cityId: unknown, cities: readonly City[] = CITIES): string[] =>
  cityOrDefault(cityId, cities).groups.flatMap((g) => g.items);

/** Whether a neighborhood is one of that city's places. */
export const inCity = (neighborhood: unknown, cityId: unknown, cities: readonly City[] = CITIES): boolean =>
  typeof neighborhood === "string" && neighborhoodsOf(cityId, cities).includes(neighborhood);

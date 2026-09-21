import { BRAND } from "./brand";
import { pacificHour } from "./time";

// Generated cover art for a meetup. Nobody uploads anything, so there is nothing to moderate: the
// picture is drawn from the meetup's own public details, and the same meetup always gets the same
// picture.
//
//   time of day    -> the sky (dawn, morning, midday, golden hour, dusk, night)
//   neighborhood   -> the scene (bridge, painted houses, campanile, skyline, coast, vineyard, ...)
//   category       -> the colours and the floating shapes
//   skill level    -> the ridge line: soft hills for beginners, jagged peaks for advanced
//   group size     -> how many little people stand on the ground
//   the meetup id  -> the random details, so two similar meetups still look different
//
// Only public fields go in (never a venue or address), and no text ever goes out: every value in the
// SVG is a number, a fixed keyword or a colour, so nothing a person types can end up in the markup.

export type CoverInput = {
  id: string;
  category: string;
  neighborhood: string;
  startsAt: string;
  skill?: string | null;
  maxSpots?: number | null;
};

export type Slot = "dawn" | "morning" | "midday" | "golden" | "dusk" | "night";
export type Scene = "bridge" | "houses" | "campanile" | "skyline" | "coast" | "vineyard" | "redwoods" | "hills";

const W = 400;
const H = 200;

// ───────────── tiny helpers ─────────────

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every number written into the SVG goes through here, so only digits, ".", and "-" can appear. */
const n = (v: number) => String(Math.round(v * 10) / 10);

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

type RGB = [number, number, number];
const toRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const toHex = ([r, g, b]: RGB) => "#" + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [toRgb(a), toRgb(b)];
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
};

// ───────────── what each detail means ─────────────

export function slotFor(hour: number): Slot {
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 11) return "morning";
  if (hour >= 11 && hour < 16) return "midday";
  if (hour >= 16 && hour < 19) return "golden";
  if (hour >= 19 && hour < 21) return "dusk";
  return "night";
}

// Sky colours from the top down to the horizon, and where the sun sits.
const SKY: Record<Slot, { stops: [string, string, string]; sunY: number }> = {
  dawn: { stops: ["#7f93c9", "#f2b7a4", "#ffe3c2"], sunY: 122 },
  morning: { stops: ["#8cd0f0", "#c8ecf7", "#fff2d4"], sunY: 78 },
  midday: { stops: ["#5eb8ea", "#a0dcf5", "#e6f6fb"], sunY: 38 },
  golden: { stops: ["#6fa6dc", "#f5c78c", "#ffe7b6"], sunY: 100 },
  dusk: { stops: ["#3d4a88", "#c9708f", "#f8b78a"], sunY: 126 },
  night: { stops: ["#0e1a3c", "#21356b", "#3b5a98"], sunY: 0 },
};

// One colour per category, so the same kind of meetup always feels the same.
export const CATEGORY_COLOR: Record<string, string> = {
  Basketball: "#e2853a", Soccer: "#3f9d4f", Pickleball: "#8fb339", Tennis: "#c4b02c", Running: "#3f8fc4",
  Hiking: "#2f8f6a", Cycling: "#2aa198", Volleyball: "#d95f7a", Climbing: "#8a7a6a", Yoga: "#d67aa8",
  Swimming: "#2aa7c9", Dance: "#9a5fd0", "Board Games": "#7a5fd0", "Video Games": "#5a5fd0",
  "Coffee Chat": "#b7793a", Dinner: "#c2483d", Conversation: "#e08a4a", "Book Club": "#8d63a8",
  "Language Exchange": "#4a7fd0", Networking: "#6b7a90", "Food & Drink": "#d0574a", Music: "#c04fc0",
  "Arts & Crafts": "#8a9a5a", Photography: "#6b7a8a", Volunteering: "#4faf6a", "Other sports & fitness": "#d9822b", "Other social & interests": "#b14fb3", Other: BRAND.accent,
};

type Family = "sport" | "game" | "social" | "art" | "outdoor";
const FAMILY: Record<string, Family> = {
  Basketball: "sport", Soccer: "sport", Pickleball: "sport", Tennis: "sport", Volleyball: "sport", Swimming: "sport",
  Dance: "art", Cycling: "sport", Running: "outdoor", Hiking: "outdoor", Climbing: "outdoor", Volunteering: "outdoor",
  Yoga: "outdoor", "Board Games": "game", "Video Games": "game", "Coffee Chat": "social", Dinner: "social",
  Conversation: "social", "Book Club": "social", "Language Exchange": "social", Networking: "social",
  "Food & Drink": "social", Music: "art", "Arts & Crafts": "art", Photography: "art", "Other sports & fitness": "sport", "Other social & interests": "social", Other: "social",
};

// Where in the Bay Area a meetup is decides the scene behind it. Every neighborhood in the post
// form is listed (a test fails if a new one is added without a scene).
const SCENES: Record<string, Scene> = {
  "SF - Mission": "houses", "SF - Marina": "bridge", "SF - Sunset": "coast", "SF - SoMa": "skyline",
  "SF - Richmond": "bridge", "SF - Presidio": "bridge", "SF - Other": "houses",
  // East Bay
  Alameda: "coast", Albany: "houses", Antioch: "hills", Berkeley: "campanile", Brentwood: "hills", Clayton: "hills",
  Concord: "hills", Danville: "hills", Dublin: "hills", "El Cerrito": "houses", Emeryville: "skyline", Fremont: "hills",
  Hayward: "hills", Hercules: "coast", Lafayette: "redwoods", Livermore: "vineyard", Martinez: "hills",
  Moraga: "hills", Newark: "coast", Oakland: "skyline", Oakley: "hills", Orinda: "redwoods", Piedmont: "houses",
  Pinole: "coast", Pittsburg: "hills", "Pleasant Hill": "hills", Pleasanton: "vineyard", Richmond: "coast",
  "San Leandro": "houses", "San Pablo": "houses", "San Ramon": "hills", "Union City": "hills", "Walnut Creek": "skyline",
  // Peninsula
  Atherton: "redwoods", Belmont: "hills", Brisbane: "coast", Burlingame: "houses", Colma: "hills", "Daly City": "houses",
  "East Palo Alto": "houses", "Foster City": "coast", "Half Moon Bay": "coast", Hillsborough: "redwoods",
  "Menlo Park": "redwoods", Millbrae: "houses", Pacifica: "coast", "Portola Valley": "redwoods",
  "Redwood City": "skyline", "San Bruno": "houses", "San Carlos": "hills", "San Mateo": "skyline",
  "South San Francisco": "skyline", Woodside: "redwoods",
  // South Bay
  Campbell: "houses", Cupertino: "hills", Gilroy: "vineyard", "Los Altos": "hills", "Los Altos Hills": "hills",
  "Los Gatos": "redwoods", Milpitas: "hills", "Monte Sereno": "redwoods", "Morgan Hill": "vineyard",
  "Mountain View": "skyline", "Palo Alto": "campanile", "San Jose": "skyline", "Santa Clara": "skyline",
  Saratoga: "redwoods", Sunnyvale: "skyline",
  // North Bay
  Marin: "redwoods", "American Canyon": "hills", Belvedere: "bridge", Benicia: "coast", Calistoga: "vineyard",
  Cloverdale: "vineyard", "Corte Madera": "redwoods", Cotati: "vineyard", Dixon: "hills", Fairfax: "redwoods",
  Fairfield: "hills", Healdsburg: "vineyard", Larkspur: "redwoods", "Mill Valley": "redwoods", Napa: "vineyard",
  Novato: "hills", Petaluma: "vineyard", "Rio Vista": "coast", "Rohnert Park": "vineyard", Ross: "redwoods",
  "San Anselmo": "redwoods", "San Rafael": "redwoods", "Santa Rosa": "vineyard", Sausalito: "bridge",
  Sebastopol: "vineyard", Sonoma: "vineyard", "St. Helena": "vineyard", "Suisun City": "coast", Tiburon: "bridge",
  Vacaville: "hills", Vallejo: "coast", Windsor: "vineyard", Yountville: "vineyard",
  Other: "hills",
};
const ALL_SCENES: Scene[] = ["bridge", "houses", "campanile", "skyline", "coast", "vineyard", "redwoods", "hills"];

export const sceneFor = (neighborhood: string, fallbackSeed = 0): Scene =>
  Object.prototype.hasOwnProperty.call(SCENES, neighborhood) ? SCENES[neighborhood] : ALL_SCENES[fallbackSeed % ALL_SCENES.length];

/** Skill level -> how rough the ridge line is. */
const ROUGHNESS: Record<string, number> = { Beginner: 0.55, "All levels": 1, Intermediate: 1.5, Advanced: 2.3 };

export type CoverSpec = {
  slot: Slot;
  scene: Scene;
  color: string;
  family: Family;
  roughness: number;
  people: number;
  seed: number;
};

export function coverSpec(input: CoverInput): CoverSpec {
  const seed = hash(input.id);
  const hour = Number.isFinite(new Date(input.startsAt).getTime()) ? pacificHour(input.startsAt) : 12;
  return {
    slot: slotFor(hour),
    scene: sceneFor(input.neighborhood, seed),
    color: CATEGORY_COLOR[input.category] ?? CATEGORY_COLOR.Other,
    family: FAMILY[input.category] ?? "social",
    roughness: ROUGHNESS[input.skill ?? ""] ?? 1,
    people: clamp(Math.round(input.maxSpots ?? 6), 2, 9),
    seed,
  };
}

// ───────────── drawing ─────────────

type Rand = () => number;
const between = (r: Rand, a: number, b: number) => a + (b - a) * r();

/** A ridge line across the picture, closed off at the bottom. Rough ridges are peaks; soft ones are curves. */
function ridge(r: Rand, base: number, amp: number, roughness: number, fill: string, opacity = 1) {
  const step = 25;
  const pts: [number, number][] = [];
  for (let x = -step; x <= W + step; x += step) pts.push([x, base - r() * amp * (0.5 + roughness * 0.5) - (r() < 0.3 ? amp * 0.3 * roughness : 0)]);
  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
  if (roughness >= 1.5) {
    for (const [x, y] of pts.slice(1)) d += `L${n(x)} ${n(y)}`;
  } else {
    for (let i = 1; i < pts.length; i++) {
      const [px, py] = pts[i - 1];
      const [x, y] = pts[i];
      d += `Q${n(px)} ${n(py)} ${n((px + x) / 2)} ${n((py + y) / 2)}`;
    }
  }
  d += `L${W + step} ${H}L${-step} ${H}Z`;
  return `<path d="${d}" fill="${fill}" opacity="${n(opacity)}"/>`;
}

function accentShapes(r: Rand, spec: CoverSpec) {
  const out: string[] = [];
  const count = 4 + Math.floor(r() * 3);
  const kinds: Record<Family, string[]> = {
    sport: ["ring", "dot", "ring"],
    game: ["diamond", "square", "dot"],
    social: ["dot", "ring", "dot"],
    art: ["wave", "dot", "wave"],
    outdoor: ["leaf", "tri", "dot"],
  };
  for (let i = 0; i < count; i++) {
    const kind = kinds[spec.family][Math.floor(r() * 3)];
    const x = between(r, 14, W - 14);
    const y = between(r, 14, 92);
    const s = between(r, 5, 13);
    const o = n(between(r, 0.28, 0.5));
    const c = spec.color;
    if (kind === "dot") out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(s / 1.6)}" fill="${c}" opacity="${o}"/>`);
    else if (kind === "ring") out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(s)}" fill="none" stroke="${c}" stroke-width="2.4" opacity="${o}"/>`);
    else if (kind === "diamond") out.push(`<path d="M${n(x)} ${n(y - s)}L${n(x + s)} ${n(y)}L${n(x)} ${n(y + s)}L${n(x - s)} ${n(y)}Z" fill="${c}" opacity="${o}"/>`);
    else if (kind === "square") out.push(`<rect x="${n(x - s / 1.5)}" y="${n(y - s / 1.5)}" width="${n(s * 1.3)}" height="${n(s * 1.3)}" rx="2.5" fill="${c}" opacity="${o}" transform="rotate(${n(between(r, -30, 30))} ${n(x)} ${n(y)})"/>`);
    else if (kind === "tri") out.push(`<path d="M${n(x)} ${n(y - s)}L${n(x + s)} ${n(y + s * 0.7)}L${n(x - s)} ${n(y + s * 0.7)}Z" fill="${c}" opacity="${o}"/>`);
    else if (kind === "leaf") out.push(`<path d="M${n(x - s)} ${n(y)}Q${n(x)} ${n(y - s * 1.4)} ${n(x + s)} ${n(y)}Q${n(x)} ${n(y + s * 1.4)} ${n(x - s)} ${n(y)}Z" fill="${c}" opacity="${o}" transform="rotate(${n(between(r, -50, 50))} ${n(x)} ${n(y)})"/>`);
    else out.push(`<path d="M${n(x - s * 1.6)} ${n(y)}q${n(s * 0.8)} ${n(-s)} ${n(s * 1.6)} 0t${n(s * 1.6)} 0" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" opacity="${o}"/>`);
  }
  return out.join("");
}

function sky(r: Rand, spec: CoverSpec, gid: string) {
  const { stops, sunY } = SKY[spec.slot];
  let out = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${stops[0]}"/><stop offset="0.55" stop-color="${stops[1]}"/><stop offset="1" stop-color="${stops[2]}"/></linearGradient></defs>`;
  out += `<rect width="${W}" height="${H}" fill="url(#${gid})"/>`;
  if (spec.slot === "night") {
    for (let i = 0; i < 34; i++) out += `<circle cx="${n(between(r, 4, W - 4))}" cy="${n(between(r, 4, 110))}" r="${n(between(r, 0.6, 1.6))}" fill="#ffffff" opacity="${n(between(r, 0.35, 0.95))}"/>`;
    const mx = between(r, 60, 340);
    out += `<circle cx="${n(mx)}" cy="34" r="15" fill="#f6f2dd"/><circle cx="${n(mx + 7)}" cy="30" r="13" fill="${stops[0]}"/>`;
  } else {
    const sx = between(r, 70, 330);
    const glow = spec.slot === "dusk" || spec.slot === "dawn" || spec.slot === "golden" ? "#ffd9a0" : "#fff6cc";
    out += `<circle cx="${n(sx)}" cy="${n(sunY)}" r="46" fill="${glow}" opacity="0.22"/><circle cx="${n(sx)}" cy="${n(sunY)}" r="${n(between(r, 15, 21))}" fill="${spec.slot === "midday" ? "#fffbe0" : "#fff1b8"}"/>`;
    const clouds = 2 + Math.floor(r() * 2);
    for (let i = 0; i < clouds; i++) {
      const cx = between(r, 30, W - 50);
      const cy = between(r, 20, 78);
      const s = between(r, 0.8, 1.4);
      out += `<g opacity="${n(between(r, 0.5, 0.8))}" fill="#ffffff"><ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(24 * s)}" ry="${n(8 * s)}"/><ellipse cx="${n(cx - 14 * s)}" cy="${n(cy + 3)}" rx="${n(14 * s)}" ry="${n(6 * s)}"/><ellipse cx="${n(cx + 15 * s)}" cy="${n(cy + 2)}" rx="${n(16 * s)}" ry="${n(6 * s)}"/></g>`;
    }
  }
  return out;
}

const HOUSE_COLORS = ["#f2c14e", "#e57f84", "#7bb7c9", "#a9c47f", "#f0a06b", "#b79ad6", "#f4d9c6"];

/** Everything between the sky and the ground: the landmark or landscape for this neighborhood. */
function landscape(r: Rand, spec: CoverSpec, ink: string, mid: string, horizon: string) {
  const night = spec.slot === "night" || spec.slot === "dusk";
  const lit = night ? "#ffe08a" : mix(mid, "#ffffff", 0.55);
  let out = "";
  switch (spec.scene) {
    case "bridge": {
      const orange = mix("#c8492e", ink, night ? 0.5 : 0.08);
      out += ridge(r, 128, 26, spec.roughness, mix(horizon, spec.color, 0.3), 0.85);
      out += `<rect y="150" width="${W}" height="60" fill="${mix(horizon, "#3d6f96", night ? 0.75 : 0.55)}"/>`;
      out += `<path d="M0 124L146 88Q208 130 268 88L${W} 124" fill="none" stroke="${orange}" stroke-width="2.4"/>`;
      out += `<rect y="126" width="${W}" height="5" fill="${orange}"/>`;
      for (const x of [142, 264]) out += `<rect x="${x}" y="84" width="9" height="68" fill="${orange}"/><rect x="${x - 2}" y="102" width="13" height="3" fill="${orange}"/>`;
      for (let x = 30; x < W; x += 22) if (Math.abs(x - 146) > 12 && Math.abs(x - 270) > 12) out += `<path d="M${n(x)} ${x < 146 ? n(124 - (x / 146) * 36) : x < 268 ? n(96 + Math.sin(((x - 146) / 122) * Math.PI) * 30) : n(88 + ((x - 268) / 132) * 36)}V126" stroke="${orange}" stroke-width="0.9" opacity="0.7"/>`;
      out += `<ellipse cx="${n(between(r, 120, 280))}" cy="146" rx="90" ry="9" fill="#ffffff" opacity="${night ? 0.12 : 0.42}"/>`;
      break;
    }
    case "houses": {
      out += ridge(r, 136, 18, spec.roughness, mix(horizon, spec.color, 0.25), 0.75);
      let x = -6;
      while (x < W) {
        const w = between(r, 26, 40);
        const h = between(r, 28, 46);
        const c = HOUSE_COLORS[Math.floor(r() * HOUSE_COLORS.length)];
        const body = mix(c, ink, night ? 0.55 : 0.05);
        const base = 158;
        out += `<rect x="${n(x)}" y="${n(base - h)}" width="${n(w)}" height="${n(h + 8)}" fill="${body}"/>`;
        out += `<path d="M${n(x - 2)} ${n(base - h)}L${n(x + w / 2)} ${n(base - h - 12)}L${n(x + w + 2)} ${n(base - h)}Z" fill="${mix(body, ink, 0.35)}"/>`;
        out += `<rect x="${n(x + w * 0.2)}" y="${n(base - h + 8)}" width="6" height="8" fill="${lit}"/><rect x="${n(x + w * 0.6)}" y="${n(base - h + 8)}" width="6" height="8" fill="${lit}"/>`;
        x += w + between(r, 1, 4);
      }
      break;
    }
    case "campanile": {
      out += ridge(r, 126, 30, spec.roughness, mix(horizon, spec.color, 0.35), 0.9);
      const tx = between(r, 230, 300);
      const stone = mix("#e9e1cf", ink, night ? 0.6 : 0.12);
      out += `<rect x="${n(tx)}" y="52" width="14" height="100" fill="${stone}"/><path d="M${n(tx - 2)} 52L${n(tx + 7)} 34L${n(tx + 16)} 52Z" fill="${mix(stone, "#6b8f5e", 0.5)}"/>`;
      out += `<rect x="${n(tx + 4)}" y="60" width="6" height="14" fill="${mid}"/><rect x="${n(tx + 5)}" y="86" width="4" height="8" fill="${mid}"/>`;
      for (let i = 0; i < 6; i++) {
        const gx = between(r, 10, W - 10);
        if (Math.abs(gx - tx) < 26) continue;
        out += `<rect x="${n(gx)}" y="128" width="3" height="26" fill="${ink}"/><ellipse cx="${n(gx + 1.5)}" cy="${n(122 - r() * 8)}" rx="${n(between(r, 9, 14))}" ry="${n(between(r, 14, 22))}" fill="${mix(ink, "#4f7f4a", night ? 0.15 : 0.45)}"/>`;
      }
      break;
    }
    case "skyline": {
      out += ridge(r, 132, 20, spec.roughness, mix(horizon, spec.color, 0.25), 0.7);
      let x = 6;
      let windows = "";
      while (x < W - 10) {
        const w = between(r, 16, 32);
        const h = between(r, 26, 84);
        out += `<rect x="${n(x)}" y="${n(154 - h)}" width="${n(w)}" height="${n(h + 8)}" fill="${mid}"/>`;
        if (r() < 0.25) out += `<rect x="${n(x + w / 2 - 1)}" y="${n(154 - h - 12)}" width="2" height="12" fill="${mid}"/>`;
        // every lit window is a small square in one shared path (much lighter than a tag each)
        for (let wy = 154 - h + 7; wy < 150; wy += 10) for (let wx = x + 4; wx < x + w - 4; wx += 7) if (r() < (night ? 0.55 : 0.18)) windows += `M${n(wx)} ${n(wy)}h2.6v3.6h-2.6z`;
        x += w + between(r, 1, 5);
      }
      out += `<path d="${windows}" fill="${lit}" opacity="${night ? 0.95 : 0.6}"/>`;
      const px = between(r, 60, 320);
      out += `<path d="M${n(px)} 154L${n(px + 12)} 40L${n(px + 24)} 154Z" fill="${mix(mid, ink, 0.25)}"/>`;
      break;
    }
    case "coast": {
      out += ridge(r, 124, 22, spec.roughness, mix(horizon, spec.color, 0.3), 0.7);
      out += `<rect y="132" width="${W}" height="80" fill="${mix(horizon, "#2f7fa6", night ? 0.8 : 0.6)}"/>`;
      for (let i = 0; i < 7; i++) {
        const y = 140 + i * 8;
        const x0 = between(r, -20, 200);
        out += `<path d="M${n(x0)} ${n(y)}q14 -6 28 0t28 0t28 0t28 0t28 0" fill="none" stroke="#ffffff" stroke-width="1.6" opacity="${n(between(r, 0.25, 0.6))}"/>`;
      }
      const cx = r() < 0.5 ? 0 : W;
      out += `<path d="M${cx} 118L${cx === 0 ? 70 : 330} 150L${cx === 0 ? 96 : 304} 162L${cx} 170Z" fill="${ink}"/>`;
      break;
    }
    case "vineyard": {
      out += ridge(r, 116, 26, spec.roughness, mix(horizon, "#9fb56b", 0.45), 0.9);
      out += ridge(r, 134, 14, spec.roughness, mix(spec.color, "#6f8f45", 0.55), 1);
      const vx = between(r, 150, 250);
      const rowA = mix("#5d7d3a", ink, night ? 0.6 : 0.1);
      for (let i = -9; i <= 9; i++) out += `<path d="M${n(vx)} 138L${n(vx + i * 44)} 176" stroke="${i % 2 ? rowA : mix(rowA, "#c9d48f", 0.35)}" stroke-width="${n(2.4 + Math.abs(i) * 0.5)}"/>`;
      break;
    }
    case "redwoods": {
      out += `<rect y="120" width="${W}" height="80" fill="${mix(horizon, spec.color, 0.2)}" opacity="0.5"/>`;
      for (const [layer, col, hMin, hMax] of [[0, mix(mid, "#3d6b4a", 0.4), 40, 90], [1, mix(ink, "#2b5a3a", night ? 0.15 : 0.55), 60, 118]] as const) {
        let trees = ""; // every tree of this layer (trunk and three tiers) in a single path
        for (let x = layer ? 6 : -4; x < W + 10; x += between(r, 20, 34)) {
          const h = between(r, hMin, hMax);
          const w = h * 0.34;
          const base = 158;
          trees += `M${n(x - 1.5)} ${n(base - 8)}h3v12h-3z`;
          for (let t = 0; t < 3; t++) trees += `M${n(x)} ${n(base - h + t * h * 0.22)}L${n(x + w * (0.5 + t * 0.25))} ${n(base - h * (0.42 - t * 0.1))}L${n(x - w * (0.5 + t * 0.25))} ${n(base - h * (0.42 - t * 0.1))}Z`;
        }
        out += `<path d="${trees}" fill="${col}"/>`;
        if (!layer) out += `<ellipse cx="200" cy="146" rx="230" ry="10" fill="#ffffff" opacity="${night ? 0.1 : 0.4}"/>`;
      }
      break;
    }
    default: {
      out += ridge(r, 112, 34, spec.roughness, mix(horizon, spec.color, 0.3), 0.85);
      out += ridge(r, 136, 24, spec.roughness, mix(ink, "#5e8a4c", night ? 0.1 : 0.45), 1);
      const trees = 2 + Math.floor(r() * 3);
      for (let i = 0; i < trees; i++) {
        const x = between(r, 20, W - 20);
        out += `<rect x="${n(x - 1.4)}" y="132" width="2.8" height="18" fill="${ink}"/><circle cx="${n(x)}" cy="${n(128 - r() * 6)}" r="${n(between(r, 9, 14))}" fill="${mix(ink, "#3f7a45", night ? 0.1 : 0.4)}"/>`;
      }
    }
  }
  return out;
}

const svgCache = new Map<string, string>();

/** The finished picture as SVG markup. Only numbers, keywords and colours go in, never text. */
export function coverSvg(input: CoverInput): string {
  const key = [input.id, input.category, input.neighborhood, input.startsAt, input.skill ?? "", input.maxSpots ?? ""].join("|");
  const cached = svgCache.get(key);
  if (cached) return cached;

  const spec = coverSpec(input);
  const r = rng(spec.seed);
  const gid = `c${spec.seed.toString(36)}`;
  const { stops } = SKY[spec.slot];
  const night = spec.slot === "night";
  const ink = mix(spec.color, night ? "#08101f" : "#1c2a1f", night ? 0.82 : 0.62);
  const mid = mix(stops[2], spec.color, night ? 0.25 : 0.42);

  let body = sky(r, spec, gid);
  body += accentShapes(r, spec);
  body += landscape(r, spec, ink, night ? mix(mid, "#0b1226", 0.6) : mix(mid, ink, 0.35), stops[2]);

  // the ground, with a little group of people standing on it
  body += `<rect y="168" width="${W}" height="40" fill="${ink}"/>`;
  const figure = mix(spec.color, "#ffffff", night ? 0.55 : 0.4);
  for (let i = 0; i < spec.people; i++) {
    const x = (W / (spec.people + 1)) * (i + 1) + between(r, -7, 7);
    const s = between(r, 0.9, 1.25);
    body += `<circle cx="${n(x)}" cy="${n(172 - 8 * s)}" r="${n(3.2 * s)}" fill="${figure}"/><rect x="${n(x - 3.6 * s)}" y="${n(172 - 4.6 * s)}" width="${n(7.2 * s)}" height="${n(11 * s)}" rx="3" fill="${figure}"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">${body}</svg>`;
  if (svgCache.size > 400) svgCache.clear();
  svgCache.set(key, svg);
  return svg;
}

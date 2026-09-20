import { firstName } from "@/lib/utils";

// Muted, distinct tones. The same name always gets the same one.
const TONES = [
  "bg-amber-100 text-amber-900",
  "bg-emerald-100 text-emerald-900",
  "bg-sky-100 text-sky-900",
  "bg-rose-100 text-rose-900",
  "bg-violet-100 text-violet-900",
  "bg-teal-100 text-teal-900",
  "bg-orange-100 text-orange-900",
  "bg-indigo-100 text-indigo-900",
];

const toneFor = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
};

const SIZES = { sm: "h-6 w-6 text-[0.65rem]", md: "h-8 w-8 text-xs", lg: "h-12 w-12 text-base" };

/** A person's initial in a colored circle. No photos, so nothing to moderate. */
export function Avatar({ name, size = "md", ring = false }: { name: string; size?: keyof typeof SIZES; ring?: boolean }) {
  const label = firstName(name);
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold uppercase ${SIZES[size]} ${toneFor(label)} ${
        ring ? "ring-2 ring-white" : ""
      }`}
    >
      {label.charAt(0)}
    </span>
  );
}

/** Overlapping avatars for a few of the people going. */
export function AvatarStack({ names, max = 3 }: { names: string[]; max?: number }) {
  return (
    <span className="flex -space-x-2">
      {names.slice(0, max).map((n, i) => (
        <Avatar key={`${n}-${i}`} name={n} size="sm" ring />
      ))}
    </span>
  );
}

/** "Sam is going", "Sam and Ana are going", "Sam, Ana and 3 others are going". */
export function goingSummary(names: string[]) {
  const f = names.map(firstName);
  if (f.length === 0) return "";
  if (f.length === 1) return `${f[0]} is going`;
  if (f.length === 2) return `${f[0]} and ${f[1]} are going`;
  const others = f.length - 2;
  return `${f[0]}, ${f[1]} and ${others} ${others === 1 ? "other" : "others"} are going`;
}

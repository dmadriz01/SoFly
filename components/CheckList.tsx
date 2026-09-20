import type { Check } from "@/lib/diagnose";

/** ✓ / ✗ results from a diagnostic, with the reason next to anything that failed. */
export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="mt-3 space-y-2 text-sm" aria-live="polite">
      {checks.map((c) => (
        <li key={c.label} className="flex gap-2">
          <span aria-hidden className={c.ok ? "text-emerald-600" : "text-red-600"}>
            {c.ok ? "✓" : "✗"}
          </span>
          <span>
            <span className="font-medium">{c.label}</span>
            {c.detail && <span className="block text-muted">{c.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

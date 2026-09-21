"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setCity } from "@/app/actions";

/** Which city you're browsing. Only shown when there is more than one city to choose from. */
export function CitySwitcher({
  cities,
  current,
  label = "City",
  className = "",
}: {
  cities: readonly { id: string; name: string }[];
  current: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string>();
  if (cities.length < 2) return null;

  function change(id: string) {
    const before = value;
    setValue(id);
    setError(undefined);
    startTransition(async () => {
      const result = await setCity(id);
      if (result.error) {
        setValue(before);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className={className}>
      <label className="flex items-center gap-2 text-sm">
        <span aria-hidden>📍</span>
        <span className="sr-only">{label}</span>
        <select
          aria-label={label}
          value={value}
          disabled={pending}
          onChange={(e) => change(e.target.value)}
          className="field tap !w-auto min-w-0 max-w-full !py-1.5 text-sm font-semibold"
        >
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}

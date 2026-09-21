"use client";

import { useState, useTransition } from "react";
import { saveInterests } from "@/app/actions";
import { CATEGORY_EMOJI, CATEGORY_GROUPS, type Category } from "@/lib/constants";

/**
 * Pick the kinds of meetups you're into. "onboarding" continues to `next` afterward and
 * offers Skip; "settings" saves in place.
 */
export function InterestsForm({
  initial,
  next,
  mode,
}: {
  initial: string[];
  next?: string;
  mode: "onboarding" | "settings";
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));
  const [message, setMessage] = useState<{ text: string; ok: boolean }>();
  const [pending, startTransition] = useTransition();

  function toggle(category: string) {
    setMessage(undefined);
    setSelected((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(category)) nextSet.delete(category);
      else nextSet.add(category);
      return nextSet;
    });
  }

  function save(list: string[]) {
    setMessage(undefined);
    startTransition(async () => {
      // With `next`, success redirects and we never get here.
      const result = await saveInterests(list, mode === "onboarding" ? next : undefined);
      if (result?.error) setMessage({ text: result.error, ok: false });
      else setMessage({ text: "Saved.", ok: true });
    });
  }

  return (
    <div className="space-y-5">
      {CATEGORY_GROUPS.filter((g) => g.label !== "Other").map((group) => (
        <fieldset key={group.label}>
          <legend className="mb-2 text-sm font-semibold">{group.label}</legend>
          <div className="flex flex-wrap gap-2">
            {group.items.map((c) => {
              const on = selected.has(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggle(c)}
                  aria-pressed={on}
                  className={`rounded-full border px-3.5 py-2 text-sm font-medium transition active:scale-95 ${
                    on
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-surface text-ink hover:border-accent/50"
                  }`}
                >
                  <span aria-hidden className="mr-1.5">
                    {CATEGORY_EMOJI[c as Category]}
                  </span>
                  {c}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => save(Array.from(selected))}
          disabled={pending}
          className={mode === "onboarding" ? "btn-primary w-full" : "btn-primary"}
        >
          {pending
            ? "Saving…"
            : mode === "onboarding"
              ? selected.size > 0
                ? `Continue with ${selected.size} ${selected.size === 1 ? "interest" : "interests"}`
                : "Continue"
              : "Save interests"}
        </button>
        {mode === "onboarding" && (
          <button
            type="button"
            onClick={() => save([])}
            disabled={pending}
            className="w-full text-center text-sm font-medium text-muted underline"
          >
            Skip for now
          </button>
        )}
        {message && (
          <p className={`text-sm ${message.ok ? "text-muted" : "text-danger"}`}>{message.text}</p>
        )}
      </div>
    </div>
  );
}

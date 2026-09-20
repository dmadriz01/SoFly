"use client";

import { useState, useTransition } from "react";
import { createEvent } from "@/app/actions";
import { CHAT_APPS_HINT } from "@/lib/chat";
import { AGE_GROUPS, AUDIENCES, CATEGORY_GROUPS, SKILL_LEVELS } from "@/lib/constants";
import { NeighborhoodOptions } from "./NeighborhoodOptions";
import {
  EVENT_FIELDS,
  LIMITS,
  validateEvent,
  type EventErrors,
  type EventField,
} from "@/lib/validation";

function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: EventField;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${name}-error`} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function EventForm() {
  const [errors, setErrors] = useState<EventErrors>({});
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const cls = (name: EventField) => `field ${errors[name] ? "field-error" : ""}`;
  const aria = (name: EventField) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(undefined);
    const formData = new FormData(e.currentTarget);

    const input: Record<string, string> = {};
    for (const f of EVENT_FIELDS) input[f] = String(formData.get(f) ?? "");
    const found = validateEvent(input);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(Object.keys(found)[0])?.focus();
      return;
    }

    startTransition(async () => {
      // On success the action redirects, so we only get here on failure.
      const result = await createEvent(formData);
      if (result) {
        setErrors(result.errors);
        setFormError(result.formError);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <Field label="Title" name="title" error={errors.title}>
        <input
          id="title"
          name="title"
          type="text"
          maxLength={LIMITS.title}
          placeholder="Pickup hoops at the park"
          className={cls("title")}
          {...aria("title")}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Category" name="category" error={errors.category}>
          <select id="category" name="category" defaultValue="" className={cls("category")} {...aria("category")}>
            <option value="" disabled>
              Select…
            </option>
            {CATEGORY_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Neighborhood" name="neighborhood" error={errors.neighborhood}>
          <select
            id="neighborhood"
            name="neighborhood"
            defaultValue=""
            className={cls("neighborhood")}
            {...aria("neighborhood")}
          >
            <option value="" disabled>
              Select…
            </option>
            <NeighborhoodOptions />
          </select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Skill level" name="skill_level" error={errors.skill_level}>
          <select
            id="skill_level"
            name="skill_level"
            defaultValue="All levels"
            className={cls("skill_level")}
            {...aria("skill_level")}
          >
            {SKILL_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Who it's for" name="audience" error={errors.audience}>
          <select
            id="audience"
            name="audience"
            defaultValue="Everyone"
            className={cls("audience")}
            {...aria("audience")}
          >
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ages" name="age_group" error={errors.age_group}>
          <select
            id="age_group"
            name="age_group"
            defaultValue="18+"
            className={cls("age_group")}
            {...aria("age_group")}
          >
            {AGE_GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="-mt-2 text-xs text-muted">
        Ages come from the birthday each person enters when they sign up, and BayMeet can&rsquo;t
        verify them, so for 21+ events at a venue please check ID at the door. BayMeet also can&rsquo;t
        verify gender; &ldquo;Women-only&rdquo; sets expectations for who should join.
      </p>

      <Field label="Venue name" name="venue_name" error={errors.venue_name}>
        <input
          id="venue_name"
          name="venue_name"
          type="text"
          maxLength={LIMITS.venue_name}
          placeholder="Dolores Park"
          className={cls("venue_name")}
          {...aria("venue_name")}
        />
      </Field>

      <Field
        label="Full address"
        name="address"
        error={errors.address}
        hint="Shown publicly, with a map. Please use a public place, not your home."
      >
        <input
          id="address"
          name="address"
          type="text"
          maxLength={LIMITS.address}
          placeholder="19th St & Dolores St, San Francisco, CA"
          className={cls("address")}
          {...aria("address")}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Date & time" name="starts_at" error={errors.starts_at} hint="Pacific time">
          <input
            id="starts_at"
            name="starts_at"
            type="datetime-local"
            className={cls("starts_at")}
            {...aria("starts_at")}
          />
        </Field>
        <Field label="Max spots" name="max_spots" error={errors.max_spots}>
          <input
            id="max_spots"
            name="max_spots"
            type="number"
            inputMode="numeric"
            min={1}
            max={LIMITS.maxSpots}
            step={1}
            placeholder="10"
            className={cls("max_spots")}
            {...aria("max_spots")}
          />
        </Field>
      </div>

      <Field
        label="Description"
        name="description"
        error={errors.description}
        hint="Optional. Skill level, what to bring, where exactly to meet."
      >
        <textarea
          id="description"
          name="description"
          rows={5}
          maxLength={LIMITS.description}
          className={cls("description")}
          {...aria("description")}
        />
      </Field>

      <Field
        label="Group chat link (optional)"
        name="chat_url"
        error={errors.chat_url}
        hint={`An invite link from ${CHAT_APPS_HINT}. Only you and people who join will see it. You can add it later too.`}
      >
        <input
          id="chat_url"
          name="chat_url"
          type="url"
          inputMode="url"
          maxLength={500}
          placeholder="https://chat.whatsapp.com/…"
          className={cls("chat_url")}
          {...aria("chat_url")}
        />
      </Field>

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Posting…" : "Post meetup"}
      </button>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { updateEventDetails } from "@/app/actions";
import { LIMITS, DETAILS_FIELDS, validateEventDetails, type EventDetailsField } from "@/lib/validation";
import { Field } from "./EventForm";
import { NeighborhoodOptions } from "./NeighborhoodOptions";

type Errors = Partial<Record<EventDetailsField, string>>;

/** A host changing when and where their meetup is. The people who joined are told once it's saved. */
export function EditEventForm({
  eventId,
  initial,
  isRequest,
  toNotify,
}: {
  eventId: string;
  initial: { starts_at: string; neighborhood: string; venue_name: string; address: string };
  isRequest: boolean;
  /** How many people who joined will be told about the change. */
  toNotify: number;
}) {
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const cls = (name: EventDetailsField) => `field ${errors[name] ? "field-error" : ""}`;
  const aria = (name: EventDetailsField) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(undefined);
    const formData = new FormData(e.currentTarget);
    const input: Record<string, string> = {};
    for (const f of DETAILS_FIELDS) input[f] = String(formData.get(f) ?? "");
    const found = validateEventDetails(input);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(Object.keys(found)[0])?.focus();
      return;
    }
    startTransition(async () => {
      // On success the action redirects back to the meetup, so we only get here on failure.
      const result = await updateEventDetails(eventId, formData);
      if (result) {
        setErrors(result.errors);
        setFormError(result.formError);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <Field label="Date & time" name="starts_at" error={errors.starts_at} hint="Pacific time">
        <input id="starts_at" name="starts_at" type="datetime-local" defaultValue={initial.starts_at} className={cls("starts_at")} {...aria("starts_at")} />
      </Field>

      <Field label="Neighborhood" name="neighborhood" error={errors.neighborhood}>
        <select id="neighborhood" name="neighborhood" defaultValue={initial.neighborhood} className={cls("neighborhood")} {...aria("neighborhood")}>
          <option value="" disabled>
            Select…
          </option>
          <NeighborhoodOptions />
        </select>
      </Field>

      <Field label="Venue name" name="venue_name" error={errors.venue_name}>
        <input id="venue_name" name="venue_name" type="text" maxLength={LIMITS.venue_name} defaultValue={initial.venue_name} className={cls("venue_name")} {...aria("venue_name")} />
      </Field>

      <Field
        label="Full address"
        name="address"
        error={errors.address}
        hint={
          isRequest
            ? "Stays private: only you and people you approve can see it."
            : "Shown publicly, with a map. Please use a public place, not your home."
        }
      >
        <input id="address" name="address" type="text" maxLength={LIMITS.address} defaultValue={initial.address} className={cls("address")} {...aria("address")} />
      </Field>

      <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-dark">
        {toNotify > 0
          ? `The ${toNotify === 1 ? "1 person" : `${toNotify} people`} who joined will get an email and a push notification about what changed.`
          : "Nobody has joined yet, so nobody needs to be told. If people join later they'll see the new details."}
      </p>

      {formError && (
        <p role="alert" className="text-sm text-red-600">
          {formError}
        </p>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={pending} className="btn-primary flex-1">
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link href={`/events/${eventId}`} className="btn-secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}

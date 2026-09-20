"use client";

import { useState, useTransition } from "react";
import { completeProfile } from "@/app/actions";
import { MIN_AGE, ageOn, parseBirthDate } from "@/lib/age";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function OnboardingForm({ defaultName, next }: { defaultName: string; next: string }) {
  const [errors, setErrors] = useState<{ name?: string; birthdate?: string }>({});
  const [pending, startTransition] = useTransition();

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => thisYear - MIN_AGE - i);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const get = (k: string) => String(formData.get(k) ?? "").trim();

    const found: typeof errors = {};
    if (!get("name")) found.name = "Enter your name.";
    const birth = parseBirthDate(get("birth_year"), get("birth_month"), get("birth_day"));
    if (!birth) found.birthdate = "Enter your full birthday.";
    else if (ageOn(birth, new Date().toISOString().slice(0, 10)) < MIN_AGE)
      found.birthdate = `BayMeet is for people ${MIN_AGE} and older.`;
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    startTransition(async () => {
      // On success the action redirects, so we only get here on failure.
      const result = await completeProfile(formData, next);
      if (result) setErrors(result.errors);
    });
  }

  const sel = `field ${errors.birthdate ? "field-error" : ""}`;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-semibold">
          Your name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          maxLength={50}
          defaultValue={defaultName}
          placeholder="Alex Rivera"
          className={`field ${errors.name ? "field-error" : ""}`}
        />
        <p className="mt-1 text-xs text-muted">
          This is what others see on meetups you host or join.
        </p>
        {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
      </div>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-semibold">Your birthday</legend>
        <div className="grid grid-cols-[1.6fr_1fr_1.2fr] gap-2">
          <select name="birth_month" defaultValue="" className={sel} aria-label="Month">
            <option value="" disabled>
              Month
            </option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select name="birth_day" defaultValue="" className={sel} aria-label="Day">
            <option value="" disabled>
              Day
            </option>
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select name="birth_year" defaultValue="" className={sel} aria-label="Year">
            <option value="" disabled>
              Year
            </option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-1 text-xs text-muted">
          Only used to check age requirements on meetups. Other people never see it, and it
          can&rsquo;t be changed later, so double-check it.
        </p>
        {errors.birthdate && <p className="mt-1 text-sm text-red-600">{errors.birthdate}</p>}
      </fieldset>

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}

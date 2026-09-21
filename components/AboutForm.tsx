"use client";

import { useState, useTransition } from "react";
import { saveAbout } from "@/app/actions";
import { BIO_MAX, parseAbout, type About, type AboutErrors, type AboutInput } from "@/lib/about";
import { SOCIALS } from "@/lib/social";

const EMPTY: AboutInput = { bio: "", linkedin: "", instagram: "", x: "", tiktok: "", facebook: "" };

/** Turns a saved profile back into what the boxes should show. */
const toInput = (about: About | null): AboutInput => ({
  bio: about?.bio ?? "",
  linkedin: about?.linkedin ?? "",
  instagram: about?.instagram ?? "",
  x: about?.x_handle ?? "",
  tiktok: about?.tiktok ?? "",
  facebook: about?.facebook ?? "",
});

/**
 * A short bio and optional social usernames, so hosts know who they're letting in. "onboarding"
 * continues to `next` afterward and offers Skip; "settings" saves in place.
 */
export function AboutForm({
  initial,
  next,
  mode,
}: {
  initial: About | null;
  next?: string;
  mode: "onboarding" | "settings";
}) {
  const [values, setValues] = useState<AboutInput>(() => (initial ? toInput(initial) : EMPTY));
  const [errors, setErrors] = useState<AboutErrors>({});
  const [message, setMessage] = useState<{ text: string; ok: boolean }>();
  const [pending, startTransition] = useTransition();

  const set = (key: keyof AboutInput, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setMessage(undefined);
  };

  function save(input: AboutInput, skipping = false) {
    if (!skipping) {
      const check = parseAbout(input);
      if (!check.ok) return setErrors(check.errors);
    }
    setErrors({});
    startTransition(async () => {
      // With `next`, success redirects and we never get here.
      const result = await saveAbout(input, mode === "onboarding" ? next : undefined);
      if (result?.errors) setErrors(result.errors);
      else if (result?.error) setMessage({ text: result.error, ok: false });
      else setMessage({ text: "Saved.", ok: true });
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(values);
      }}
      noValidate
      className="space-y-4"
    >
      <div>
        <label htmlFor="about-bio" className="mb-1.5 block text-sm font-semibold">
          A little about you
        </label>
        <textarea
          id="about-bio"
          rows={4}
          maxLength={BIO_MAX}
          value={values.bio}
          onChange={(e) => set("bio", e.target.value)}
          placeholder="What you do, what you're into, why you like meeting people this way."
          className={`field text-sm ${errors.bio ? "field-error" : ""}`}
        />
        <p className="mt-1 flex justify-between text-xs text-muted">
          <span>Hosts see this when you ask to join their meetups.</span>
          <span>
            {values.bio.length}/{BIO_MAX}
          </span>
        </p>
        {errors.bio && <p className="mt-1 text-sm text-danger">{errors.bio}</p>}
      </div>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-semibold">Social profiles (optional)</legend>
        <div className="space-y-3">
          {SOCIALS.map((s) => (
            <div key={s.key}>
              <label htmlFor={`about-${s.key}`} className="mb-1 block text-xs font-medium text-muted">
                {s.label}
              </label>
              <input
                id={`about-${s.key}`}
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={values[s.key]}
                onChange={(e) => set(s.key, e.target.value)}
                placeholder={s.placeholder}
                className={`field text-sm ${errors[s.key] ? "field-error" : ""}`}
              />
              {errors[s.key] && <p className="mt-1 text-sm text-danger">{errors[s.key]}</p>}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Paste a profile link or just your username. Only hosts of meetups you join or ask to join can
          see these, and a host loses access if you cancel your request.
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={mode === "onboarding" ? "btn-primary w-full" : "btn-primary"}>
          {pending ? "Saving…" : mode === "onboarding" ? "Continue" : "Save"}
        </button>
        {mode === "onboarding" && (
          <button
            type="button"
            onClick={() => save(EMPTY, true)}
            disabled={pending}
            className="tap w-full text-center text-sm font-medium text-muted underline"
          >
            Skip for now
          </button>
        )}
        {message && <p className={`text-sm ${message.ok ? "text-muted" : "text-danger"}`}>{message.text}</p>}
      </div>
    </form>
  );
}

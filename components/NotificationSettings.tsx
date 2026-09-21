"use client";

import { useState, useTransition } from "react";
import { saveNotificationPrefs } from "@/app/actions";
import { QUIET_PRESETS, type Prefs } from "@/lib/notify-policy";

type Kind = "reminders" | "matches" | "activity";

const KINDS: { key: Kind; title: string; text: string }[] = [
  { key: "reminders", title: "Reminders", text: "The day before, \u201CStill coming?\u201D on the day, and a quick \u201Chow was it?\u201D afterwards." },
  { key: "matches", title: "New meetups for you", text: "A weekly note with meetups that match your interests." },
  { key: "activity", title: "Activity on my meetups", text: "Join requests, friends who joined, and a wrap-up when you host." },
];

const presetValue = (start: number | null, end: number | null) => (start === null || end === null ? "off" : `${start}-${end}`);

/** Choose which kinds of notification you get, and set quiet hours. Saves as you change it. */
export function NotificationSettings({ initial }: { initial: Prefs }) {
  const [on, setOn] = useState<Record<Kind, boolean>>({ reminders: initial.reminders, matches: initial.matches, activity: initial.activity });
  const [quiet, setQuiet] = useState(presetValue(initial.quietStart, initial.quietEnd));
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function save(next: Record<Kind, boolean>, quietValue: string) {
    setError(undefined);
    const [start, end] = quietValue === "off" ? [null, null] : quietValue.split("-").map(Number);
    startTransition(async () => {
      const result = await saveNotificationPrefs({ ...next, quietStart: start, quietEnd: end });
      if (result.error) setError(result.error);
    });
  }

  const known = QUIET_PRESETS.some((p) => presetValue(p.start, p.end) === quiet);

  return (
    <div className="card space-y-4 p-4">
      <div>
        <p className="font-semibold">What to send me</p>
        <p className="text-sm text-muted">Applies to email and push. Answers to your requests, cancellations and changes to a meetup you joined always come through.</p>
      </div>

      <ul className="space-y-3">
        {KINDS.map((k) => (
          <li key={k.key} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">{k.title}</p>
              <p className="text-xs text-muted">{k.text}</p>
            </div>
            <button
              role="switch"
              aria-checked={on[k.key]}
              aria-label={k.title}
              disabled={pending}
              onClick={() => {
                const next = { ...on, [k.key]: !on[k.key] };
                setOn(next);
                save(next, quiet);
              }}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${on[k.key] ? "bg-accent" : "bg-line"}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-surface shadow transition ${on[k.key] ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </li>
        ))}
      </ul>

      <div className="border-t border-line pt-3">
        <label htmlFor="quiet-hours" className="block text-sm font-semibold">
          Quiet hours
        </label>
        <p className="mb-2 text-xs text-muted">Push notifications for the three kinds above are skipped during these hours (Pacific time). Emails aren&rsquo;t affected.</p>
        <select
          id="quiet-hours"
          value={quiet}
          disabled={pending}
          onChange={(e) => {
            setQuiet(e.target.value);
            save(on, e.target.value);
          }}
          className="field !py-2 text-sm sm:w-64"
        >
          {QUIET_PRESETS.map((p) => (
            <option key={p.label} value={presetValue(p.start, p.end)}>
              {p.label}
            </option>
          ))}
          {!known && <option value={quiet}>Custom ({quiet.replace("-", " to ")})</option>}
        </select>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { sendTestEmail, setEmailNotifications } from "@/app/actions";
import type { Check } from "@/lib/diagnose";

/** One switch for all of BayMeet's emails. Login codes are always sent. */
export function EmailSettings({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [checks, setChecks] = useState<Check[]>();
  const [testError, setTestError] = useState<string>();
  const [testing, startTest] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next); // optimistic
    setError(undefined);
    startTransition(async () => {
      const result = await setEmailNotifications(next);
      if (result.error) {
        setOn(!next);
        setError(result.error);
      }
    });
  }

  function runTest() {
    setChecks(undefined);
    setTestError(undefined);
    startTest(async () => {
      const result = await sendTestEmail();
      if (result.error) setTestError(result.error);
      else setChecks(result.checks);
    });
  }

  return (
    <div className="card space-y-4 p-4">
      <div className="flex items-center justify-between gap-4">
      <div>
        <p className="font-semibold">Email me about my meetups</p>
        <p className="text-sm text-muted">
          Join requests and answers, cancellations, and a reminder the day before. Login codes always
          come through.
        </p>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label="Email notifications"
        onClick={toggle}
        disabled={pending}
        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition ${
          on ? "bg-accent" : "bg-line"
        }`}
      >
        <span
          className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-7" : "translate-x-1"
          }`}
        />
      </button>
      </div>

      <div className="border-t border-line pt-3">
        <button type="button" onClick={runTest} disabled={testing} className="btn-secondary tap !py-2 text-sm">
          {testing ? "Checking…" : "Send me a test email"}
        </button>
        {testError && <p className="mt-2 text-sm text-red-600">{testError}</p>}
        {checks && (
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
        )}
      </div>
    </div>
  );
}

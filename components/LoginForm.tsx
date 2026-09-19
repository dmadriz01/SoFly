"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState(initialError);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setStatus("sending");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setStatus("idle");
      setError(
        error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "We couldn't send that link. Check the email address and try again."
      );
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="card px-6 py-10 text-center">
        <p className="text-2xl font-bold">Check your email</p>
        <p className="mt-2 text-muted">
          We sent a magic link to <span className="font-semibold text-ink">{email.trim()}</span>.
          Tap it to log in.
        </p>
        <p className="mt-1 text-sm text-muted">Open it in this same browser.</p>
        <button
          onClick={() => setStatus("idle")}
          className="mt-6 text-sm font-medium text-accent-dark underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={status === "sending"} className="btn-primary w-full">
        {status === "sending" ? "Sending…" : "Email me a magic link"}
      </button>
    </form>
  );
}

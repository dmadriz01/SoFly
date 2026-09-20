"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "verifying">("idle");
  const [error, setError] = useState(initialError);

  async function sendLink(e: React.FormEvent<HTMLFormElement>) {
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
    setCode("");
    setStatus("sent");
  }

  async function verifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setStatus("verifying");

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });

    if (error) {
      setStatus("sent");
      setError("That code didn't work. Check it and try again, or request a new one.");
      return;
    }
    // Full navigation so the server sees the new session cookie.
    window.location.assign(`/welcome?next=${encodeURIComponent(next)}`);
  }

  if (status === "sent" || status === "verifying") {
    return (
      <div className="card space-y-5 px-6 py-8">
        <div className="text-center">
          <p className="text-2xl font-bold">Check your email</p>
          <p className="mt-2 text-muted">
            We sent a login code to{" "}
            <span className="font-semibold text-ink">{email.trim()}</span>.
          </p>
        </div>

        <form onSubmit={verifyCode} className="space-y-3">
          <div>
            <label htmlFor="code" className="mb-1.5 block text-sm font-semibold">
              Enter the code
            </label>
            <input
              id="code"
              type="text"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              maxLength={10}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="field text-center text-2xl tracking-[0.3em]"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={status === "verifying" || code.length < 6}
            className="btn-primary w-full"
          >
            {status === "verifying" ? "Checking…" : "Log in"}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          You can also tap the link in the email, if you open it in this same browser.
        </p>
        <div className="text-center">
          <button
            onClick={() => {
              setError(undefined);
              setStatus("idle");
            }}
            className="text-sm font-medium text-accent-dark underline"
          >
            Use a different email or resend
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={sendLink} className="space-y-4">
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
        {status === "sending" ? "Sending…" : "Email me a login code"}
      </button>
    </form>
  );
}

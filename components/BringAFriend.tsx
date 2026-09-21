"use client";

import { useState } from "react";

/** After joining: a one-tap way to invite a friend, with a link straight to this meetup. */
export function BringAFriend({ url, title, text, approvalOnly }: { url: string; title: string; text: string; approvalOnly: boolean }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text, url });
        return;
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return; // they closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link to share it", url);
    }
  }

  return (
    <section aria-labelledby="friend-heading" className="card space-y-2 p-4">
      <h2 id="friend-heading" className="text-sm font-semibold">
        Bring a friend
      </h2>
      <p className="text-xs text-muted">
        It&rsquo;s more fun with someone you know, and people who come with a friend are far more likely to come back.
        {approvalOnly ? " They'll still ask to join, and the host decides." : ""}
      </p>
      <button type="button" onClick={share} className="btn-secondary btn !py-2 text-sm">
        {copied ? "Link copied" : "Invite a friend"}
      </button>
    </section>
  );
}

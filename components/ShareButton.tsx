"use client";

import { useState } from "react";

export function ShareButton({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}${window.location.pathname}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The user dismissed the share sheet, or clipboard access was denied.
    }
  }

  return (
    <button
      onClick={share}
      className="tap rounded-full border border-line bg-white px-4 text-sm font-medium hover:border-accent/50"
    >
      {copied ? "Link copied" : "Share"}
    </button>
  );
}

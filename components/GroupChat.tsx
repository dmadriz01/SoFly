"use client";

import { useState, useTransition } from "react";
import { setChatLink } from "@/app/actions";
import { CHAT_APPS_HINT, chatLabel } from "@/lib/chat";

export function GroupChat({
  eventId,
  url,
  isHost,
}: {
  eventId: string;
  url: string | null;
  isHost: boolean;
}) {
  const [value, setValue] = useState(url ?? "");
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!url && !isHost) return null;

  function save(next: string) {
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      const result = await setChatLink(eventId, next);
      if (result.error) setError(result.error);
      else {
        if (!next.trim()) setValue("");
        setSaved(true);
      }
    });
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="text-sm font-semibold">Group chat</h2>

      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary w-full"
        >
          Open {chatLabel(url)} group
        </a>
      ) : (
        <p className="text-sm text-muted">
          Add a group link so people who join can coordinate (running late, where exactly to meet).
        </p>
      )}

      {isHost && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(value);
          }}
          className="space-y-2"
        >
          <label htmlFor="chat-link" className="sr-only">
            Group chat link
          </label>
          <input
            id="chat-link"
            type="text"
            inputMode="url"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            placeholder="https://chat.whatsapp.com/…"
            className="field text-sm"
          />
          <p className="text-xs text-muted">
            {CHAT_APPS_HINT} invite links. Only you and people who join can see it.
          </p>
          {error && <p className="text-sm text-danger">{error}</p>}
          {saved && !error && <p className="text-sm text-muted">Saved.</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending || !value.trim()} className="btn-secondary !py-2 text-sm">
              {pending ? "Saving…" : url ? "Update link" : "Save link"}
            </button>
            {url && (
              <button
                type="button"
                disabled={pending}
                onClick={() => save("")}
                className="btn-secondary !py-2 text-sm"
              >
                Remove
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";

/**
 * A "Filters" button that opens a panel from the bottom. The swipe screen is just the card, so all
 * the controls (date, category, neighborhood...) live in here instead of taking up room.
 */
export function FiltersSheet({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 text-sm font-semibold hover:border-accent/50"
      >
        Filters
        {count > 0 && (
          <span className="rounded-full bg-accent px-1.5 text-xs font-bold leading-5 text-white">{count}</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-40">
          <button aria-label="Close filters" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/40" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[85dvh] max-w-md flex-col rounded-t-3xl bg-cream shadow-xl"
          >
            <div className="flex items-center justify-between px-4 pb-2 pt-4">
              <h2 className="text-lg font-bold">Filters</h2>
              <button type="button" onClick={() => setOpen(false)} className="tap px-2 text-sm font-semibold text-accent-dark">
                Done
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}

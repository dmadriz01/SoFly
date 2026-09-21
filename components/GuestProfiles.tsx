import type { About } from "@/lib/about";
import { firstName } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { BioBlock } from "./BioBlock";

/** For the host: who's coming, with each guest's profile one tap away. */
export function GuestProfiles({ guests }: { guests: { userId: string; name: string; about: About | null; invitedBy?: string }[] }) {
  if (guests.length === 0) return null;
  return (
    <section className="card p-4">
      <h2 className="mb-2 text-sm font-semibold">Guest profiles</h2>
      <ul className="divide-y divide-line">
        {guests.map((g) => (
          <li key={g.userId}>
            <details className="group py-2.5">
              <summary className="tap flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
                <Avatar name={g.name} size="sm" />
                {firstName(g.name)}
                {g.invitedBy && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-dark">Invited by {g.invitedBy}</span>}
                <span aria-hidden className="ml-auto text-muted transition group-open:rotate-90">
                  ›
                </span>
              </summary>
              <div className="pb-1 pl-8 pt-1">
                <BioBlock about={g.about} />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

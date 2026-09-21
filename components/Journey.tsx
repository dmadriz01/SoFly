import Link from "next/link";
import { isNewlyReached, nextMilestone, untilText, type Milestone, type Step } from "@/lib/milestones";

/** For a new member: three small first steps, with the progress already showing. */
export function GettingStarted({ steps }: { steps: Step[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <section aria-labelledby="start-heading" className="card space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="start-heading" className="text-sm font-semibold">
          Getting started
        </h2>
        <p className="text-xs text-muted">
          {done} of {steps.length} done
        </p>
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label="Getting started progress" className="h-1.5 rounded-full bg-line">
        <div className="h-1.5 rounded-full bg-accent" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ul className="space-y-1">
        {steps.map((s) => (
          <li key={s.id}>
            <Link href={s.href} className={`flex items-center gap-2 py-1 text-sm ${s.done ? "text-muted line-through" : "font-medium text-ink hover:text-accent"}`}>
              <span aria-hidden className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs ${s.done ? "border-accent bg-accent text-on-accent" : "border-line"}`}>
                {s.done ? "✓" : ""}
              </span>
              <span>{s.label}</span>
              {s.done && <span className="sr-only"> (done)</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** For someone who's been going: what they've done so far, and how near the next thing is. */
export function Journey({ milestones, now = new Date() }: { milestones: Milestone[]; now?: Date }) {
  const earned = milestones.filter((m) => m.achieved);
  const next = nextMilestone(milestones);
  if (earned.length === 0 && !next) return null;
  return (
    <section aria-labelledby="journey-heading" className="card space-y-3 p-4">
      <h2 id="journey-heading" className="text-sm font-semibold">
        Your journey
      </h2>
      {earned.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {earned.map((m) => (
            <li key={m.id} title={m.blurb} className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent-dark">
              <span aria-hidden>{m.emoji}</span>
              {m.title}
              {isNewlyReached(m, now) && <span className="rounded-full bg-accent px-1.5 text-[0.65rem] font-bold uppercase text-on-accent">New</span>}
            </li>
          ))}
        </ul>
      )}
      {next && (
        <div className="space-y-1.5">
          <p className="text-sm text-muted">
            <span aria-hidden>{next.emoji} </span>
            {untilText(next)}
          </p>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={next.target} aria-valuenow={next.current} aria-label={`Progress toward ${next.title}`} className="h-1.5 rounded-full bg-line">
            <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.max((next.current / next.target) * 100, next.current > 0 ? 8 : 0)}%` }} />
          </div>
        </div>
      )}
    </section>
  );
}

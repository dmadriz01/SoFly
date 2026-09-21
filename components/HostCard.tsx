import { Avatar } from "./Avatar";

/** Who's hosting, and their track record: real numbers from past meetups. */
export function HostCard({
  name,
  since,
  hosted,
  joined,
  feedbackYes,
  feedbackTotal,
  cameBack = 0,
}: {
  name: string;
  since: string | null;
  hosted: number;
  joined: number;
  /** Guests' "would join again" answers across the host's past meetups. */
  feedbackYes: number;
  feedbackTotal: number;
  /** People who came to two or more of this host's meetups. */
  cameBack?: number;
}) {
  const member = since
    ? new Date(since).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "America/Los_Angeles" })
    : null;
  const record =
    hosted === 0
      ? "New host: this is their first meetup"
      : `${hosted} ${hosted === 1 ? "meetup" : "meetups"} hosted · ${joined} ${joined === 1 ? "person" : "people"} joined${cameBack > 0 ? ` · ${cameBack} came back` : ""}`;

  return (
    <div className="card flex items-center gap-3 p-4">
      <Avatar name={name} size="lg" />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your host</p>
        <p className="truncate font-semibold">{name}</p>
        <p className="text-sm text-muted">
          {record}
          {member && ` · Member since ${member}`}
        </p>
        {/* Only shown with a few answers behind it, so it's never one person's opinion. */}
        {feedbackTotal >= 3 && (
          <p className="mt-0.5 text-sm font-medium text-ink">
            👍 {feedbackYes} of {feedbackTotal} guests would join again
          </p>
        )}
      </div>
    </div>
  );
}

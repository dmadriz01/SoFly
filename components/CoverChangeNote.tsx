import type { CoverChangeNote as Note } from "@/lib/cover-change";

/** A small line under the cover picture: what changed, and that the picture was redrawn to match. */
export function CoverChangeNote({ note }: { note: Note }) {
  return (
    <p role="note" className="rounded-xl bg-accent-soft px-3 py-2 text-xs leading-relaxed text-accent-dark">
      <span className="font-semibold">Details changed {note.date}. </span>
      {note.changes.map((c, i) => (
        <span key={c.what}>
          {i > 0 && " "}
          {c.what}: {c.from} &rarr; {c.to}.
        </span>
      ))}
      {note.redrawn && " The picture is drawn from these details, so it was redrawn to match."}
    </p>
  );
}

import { aboutLinks, hasAbout, type About } from "@/lib/about";

/** A person's bio and social links, as a host sees them. */
export function BioBlock({ about }: { about: About | null | undefined }) {
  if (!about || !hasAbout(about)) {
    return <p className="text-sm text-muted">No profile added yet.</p>;
  }
  const links = aboutLinks(about);
  return (
    <div className="space-y-2">
      {about.bio && <p className="whitespace-pre-line text-sm text-ink/90">{about.bio}</p>}
      {links.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {links.map((l) => (
            <li key={l.key}>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="tap rounded-full border border-line bg-white px-3.5 text-sm font-medium text-ink hover:border-accent/50"
              >
                {l.label} ↗
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

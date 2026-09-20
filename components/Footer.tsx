import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mx-auto max-w-2xl px-4 pb-28 pt-2 text-xs text-muted md:pb-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-4">
        <Link href="/guidelines" className="hover:text-ink">
          Community guidelines
        </Link>
        <Link href="/privacy" className="hover:text-ink">
          Privacy
        </Link>
        {CONTACT_EMAIL && (
          <a href={`mailto:${CONTACT_EMAIL}?subject=BayMeet%20feedback`} className="hover:text-ink">
            Feedback
          </a>
        )}
      </div>
    </footer>
  );
}

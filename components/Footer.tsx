import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CONTACT_EMAIL } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mx-auto max-w-2xl px-4 pb-28 pt-2 text-xs text-muted md:pb-12">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-2">
        <Link href="/guidelines" className="tap hover:text-ink">
          Community guidelines
        </Link>
        <Link href="/privacy" className="tap hover:text-ink">
          Privacy
        </Link>
        {CONTACT_EMAIL && (
          <a href={`mailto:${CONTACT_EMAIL}?subject=SoFly%20feedback`} className="tap hover:text-ink">
            Feedback
          </a>
        )}
        <div className="ml-auto">
          <ThemeToggle size="sm" />
        </div>
      </div>
    </footer>
  );
}

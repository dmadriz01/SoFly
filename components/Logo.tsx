import { logoSvg } from "@/lib/butterfly";

/** The butterfly and "SoFly", as shown at the top of every page. */
export function Logo() {
  return (
    <span className="inline-flex items-center gap-1.5">
      {/* The butterfly is drawn from numbers and palette colours only (lib/butterfly.ts), never from user text. */}
      <span aria-hidden className="h-7 w-7 shrink-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: logoSvg() }} />
      <span>
        So<span className="text-accent">Fly</span>
      </span>
    </span>
  );
}

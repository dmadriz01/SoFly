import { iconSvg } from "@/lib/butterfly";

/** The app icon and "SoFly", as shown at the top of every page. The icon is the same picture as the home-screen icon. */
export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      {/* Drawn from numbers and palette colours only (lib/butterfly.ts), never from user text. */}
      <span
        aria-hidden
        className="h-8 w-8 shrink-0 overflow-hidden rounded-[22%] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: iconSvg() }}
      />
      <span>
        So<span className="text-accent">Fly</span>
      </span>
    </span>
  );
}

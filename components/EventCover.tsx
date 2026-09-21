import { memo } from "react";
import { coverSvg, type CoverInput } from "@/lib/cover";

/**
 * A meetup's generated cover picture (see lib/cover.ts). It fills its box, so give it a height.
 * Anything passed as children (the category emoji) is centred on top of the picture.
 */
function Cover({
  id,
  category,
  neighborhood,
  startsAt,
  skill,
  maxSpots,
  className = "",
  children,
}: CoverInput & { className?: string; children?: React.ReactNode }) {
  // The markup is built from numbers and colours only (no text from users), see lib/cover.ts.
  const svg = coverSvg({ id, category, neighborhood, startsAt, skill, maxSpots });
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div aria-hidden className="absolute inset-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      {children && <div className="relative flex h-full w-full items-center justify-center">{children}</div>}
    </div>
  );
}

export const EventCover = memo(Cover);

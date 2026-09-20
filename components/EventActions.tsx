/** Add to calendar (with built-in reminders) and directions, for people who are going. */
export function EventActions({
  eventId,
  address,
}: {
  eventId: string;
  /** The real address, or null when it isn't known/allowed. */
  address: string | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <a href={`/events/${eventId}/calendar.ics`} className="btn-secondary tap !py-2.5 text-sm">
        📅 Add to calendar
      </a>
      {address && (
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary tap !py-2.5 text-sm"
        >
          🧭 Directions
        </a>
      )}
    </div>
  );
}

export default function EventLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading meetup">
      <div className="skeleton h-5 w-28" />
      <div className="space-y-2">
        <div className="skeleton h-5 w-20" />
        <div className="skeleton h-8 w-4/5" />
        <div className="skeleton h-4 w-32" />
      </div>
      <div className="skeleton h-40 w-full" />
      <div className="skeleton h-24 w-full" />
    </div>
  );
}

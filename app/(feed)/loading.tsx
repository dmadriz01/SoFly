// Shown instantly while the feed loads, so navigation feels immediate.
export default function FeedLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading meetups">
      <div className="skeleton h-16 w-3/4" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="skeleton h-11" />
        <div className="skeleton h-11" />
        <div className="skeleton col-span-2 h-11 sm:col-span-1" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card space-y-3 p-4">
          <div className="skeleton h-5 w-24" />
          <div className="skeleton h-6 w-4/5" />
          <div className="skeleton h-4 w-1/2" />
          <div className="skeleton h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

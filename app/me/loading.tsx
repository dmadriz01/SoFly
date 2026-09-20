export default function MeLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your meetups">
      <div className="skeleton h-8 w-40" />
      <div className="skeleton h-36 w-full" />
      <div className="skeleton h-24 w-full" />
      <div className="skeleton h-24 w-full" />
    </div>
  );
}

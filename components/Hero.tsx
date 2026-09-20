import Link from "next/link";

/** What BayMeet is, in one glance, for someone who hasn't logged in. */
export function Hero() {
  return (
    <section className="fade-up overflow-hidden rounded-3xl bg-accent-soft px-6 py-8">
      <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
        Do more things
        <br />
        with real people.
      </h1>
      <p className="mt-3 max-w-md text-lg text-ink/80">
        Pickup games, dinners and coffee chats around the Bay Area. Find one you like and join in a tap.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/login" className="btn-primary">
          Get started
        </Link>
        <a href="#feed" className="btn-secondary">
          Browse meetups
        </a>
      </div>
      <ul className="mt-6 grid gap-2 text-sm text-ink/80 sm:grid-cols-3">
        <li className="flex gap-2">
          <span aria-hidden>🤝</span>Meet people who like what you like
        </li>
        <li className="flex gap-2">
          <span aria-hidden>🔒</span>Hosts approve small dinners, and addresses stay private
        </li>
        <li className="flex gap-2">
          <span aria-hidden>✉️</span>No password. Just an email code
        </li>
      </ul>
    </section>
  );
}

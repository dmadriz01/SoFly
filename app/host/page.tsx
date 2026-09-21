import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Host on SoFly",
  description: "Sign-ups, waitlists and reminders for your weekly run, game night or class. Free while SoFly is new.",
  openGraph: {
    title: `Host on ${SITE_NAME}`,
    description: "Sign-ups, waitlists and reminders for your weekly run, game night or class. Free while SoFly is new.",
  },
};

// What a host gets. Every line describes something SoFly really does today.
const BENEFITS = [
  {
    icon: "🔁",
    title: "Post once, repeat every week",
    text: "Put up to 12 dates in one go, weekly or every two weeks, at the same time each week.",
  },
  {
    icon: "✅",
    title: "Sign-ups that run themselves",
    text: "Set your spots and people join in a tap. When a full meetup has a spot open up, the people waiting are told right away.",
  },
  {
    icon: "🔔",
    title: "Fewer no-shows",
    text: "Guests get a reminder the day before and a “Still coming?” on the day, and can free their spot in one tap.",
  },
  {
    icon: "🔒",
    title: "You choose who comes",
    text: "Let anyone join, or approve each person. With approval, the exact address is only shared with people you say yes to.",
  },
  {
    icon: "🤝",
    title: "Guests bring friends",
    text: "Every meetup has its own invite link. You can see who was invited by whom, and the friend is welcomed by name.",
  },
  {
    icon: "📊",
    title: "See how it went",
    text: "The morning after, you get a wrap-up: how many came, how many had been before, and a link to post the next one.",
  },
];

const STEPS = [
  { title: "Sign in with your email", text: "We email you a code. There's no password to remember." },
  { title: "Post your first meetup", text: "It takes about two minutes. Pick “Repeat” to add the next few dates too." },
  { title: "Share the link", text: "Send it to your group chat. People join in a tap, and reminders take care of themselves." },
];

const QUESTIONS = [
  { q: "What does it cost?", a: "SoFly is free right now, for hosts and for guests." },
  { q: "Do my people need to install an app?", a: "No. It works in the browser on any phone or computer. On an iPhone, adding it to the Home Screen is what lets it send notifications." },
  { q: "Who can join?", a: "People 18 and older. You can also set a skill level, an age range, or Women-only or Men-only, and SoFly shows the meetup to the right people." },
  { q: "What about safety?", a: "Meet in public places, and choose to approve each person if you like. Anyone can report a meetup, and our community guidelines explain what's not allowed." },
  { q: "I already have a group chat. Do I need SoFly too?", a: "Keep the chat. Add its invite link to your meetup and only you and the people who join will see it. SoFly handles sign-ups, the waitlist and reminders so the chat doesn't have to." },
];

export default function HostPage() {
  return (
    <div className="space-y-10">
      <section className="fade-up overflow-hidden rounded-3xl bg-accent-soft px-6 py-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent-dark">For hosts</p>
        <h1 className="mt-1 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Run your group on SoFly.</h1>
        <p className="mt-3 max-w-md text-lg text-ink/80">
          Sign-ups, waitlists and reminders for your weekly run, game night or class. Free while SoFly is new.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/events/new" className="btn-primary">
            Post your first meetup
          </Link>
          <Link href="/" className="btn-secondary">
            See what guests see
          </Link>
        </div>
      </section>

      <section aria-labelledby="benefits" className="space-y-4">
        <h2 id="benefits" className="text-xl font-bold tracking-tight">What you get</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {BENEFITS.map((b) => (
            <li key={b.title} className="card p-4">
              <div aria-hidden className="text-2xl">{b.icon}</div>
              <h3 className="mt-1 font-semibold">{b.title}</h3>
              <p className="mt-1 text-sm text-muted">{b.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how" className="space-y-4">
        <h2 id="how" className="text-xl font-bold tracking-tight">How it works</h2>
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card flex gap-4 p-4">
              <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-on-accent">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-0.5 text-sm text-muted">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="questions" className="space-y-4">
        <h2 id="questions" className="text-xl font-bold tracking-tight">Good to know</h2>
        <dl className="space-y-4">
          {QUESTIONS.map((x) => (
            <div key={x.q}>
              <dt className="font-semibold">{x.q}</dt>
              <dd className="mt-0.5 text-sm text-ink/80">{x.a}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted">
          Read the <Link href="/guidelines" className="font-semibold text-accent-dark underline">community guidelines</Link> before you host.
        </p>
      </section>

      <section className="card space-y-3 p-6 text-center">
        <h2 className="text-xl font-bold tracking-tight">Ready when you are</h2>
        <p className="text-sm text-muted">Your first meetup takes about two minutes to post.</p>
        <Link href="/events/new" className="btn-primary">
          Post your first meetup
        </Link>
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Community guidelines",
  description: "How to keep BayMeet friendly, safe and useful.",
};

export default function GuidelinesPage() {
  return (
    <article className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Community guidelines</h1>
        <p className="mt-1 text-muted">BayMeet exists to get people off their phones and into the same place. Help keep it good.</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Hosting</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-ink/90">
          <li>Post real meetups that you plan to show up to.</li>
          <li>
            Choose a <strong>public place</strong>, such as a park, court, cafe or trailhead.
            Don&rsquo;t post your home address. Addresses on BayMeet are visible to everyone.
          </li>
          <li>Be clear about time, place, skill level and what to bring.</li>
          <li>No ads, selling, recruiting or promotions. Free or cost-share meetups only.</li>
          <li>If plans change, update the event or delete it so people aren&rsquo;t left waiting.</li>
          <li>
            Want a group chat? Add an invite link (WhatsApp, GroupMe, etc.) to your event. Only you and
            people who join can see it. Avoid posting your phone number publicly.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Joining</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-ink/90">
          <li>Only join if you plan to go. If you can&rsquo;t make it, tap Leave so someone else can have your spot.</li>
          <li>Be kind and inclusive. No harassment, discrimination, or unwanted advances.</li>
          <li>BayMeet is for people 18 and older.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Staying safe</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-ink/90">
          <li>You&rsquo;re meeting people you haven&rsquo;t met before. Tell a friend where you&rsquo;re going.</li>
          <li>Arrange your own transportation, and leave if something feels off.</li>
          <li>Hosts and attendees aren&rsquo;t screened or vetted by BayMeet. Meetups are organized by individuals, and you take part at your own risk.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Reporting</h2>
        <p className="text-ink/90">
          Use <strong>Report this meetup</strong> at the bottom of any event page for spam, scams, unsafe
          or misleading posts. We may remove meetups or accounts that break these guidelines.
          {CONTACT_EMAIL && (
            <>
              {" "}
              For anything urgent, email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-accent-dark underline">
                {CONTACT_EMAIL}
              </a>
              .
            </>
          )}
        </p>
        <p className="text-ink/90">If you are ever in danger, call 911.</p>
      </section>
    </article>
  );
}

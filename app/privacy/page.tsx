import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What BayMeet collects, who can see it, and how to remove it.",
};

export default function PrivacyPage() {
  return (
    <article className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Privacy</h1>
        <p className="mt-1 text-sm text-muted">Last updated September 19, 2026</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">What we collect</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-ink/90">
          <li>
            <strong>Your email address</strong>, used only to log you in with a one-time code or link.
            We don&rsquo;t show it to other users.
          </li>
          <li>
            <strong>Your name</strong>, if you give one. If you don&rsquo;t, we use the part of your email
            before the @.
          </li>
          <li>
            <strong>Your birthday</strong>, which we ask for when you first log in, to check the age
            requirements on meetups. It&rsquo;s private: other users never see it, it&rsquo;s used
            only to check age requirements, and it can&rsquo;t be changed once saved.
          </li>
          <li>
            <strong>What you post and do:</strong> meetups you host, and meetups you join.
          </li>
          <li>
            <strong>Reports</strong> you file about meetups.
          </li>
          <li>
            <strong>Basic usage data</strong> (page views, device type) through Vercel Analytics, which
            doesn&rsquo;t use cookies or track you across other sites.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">What other people can see</h2>
        <p className="text-ink/90">
          Meetups are public, including to people who aren&rsquo;t logged in. That includes the title,
          description, time, venue and full address, the host&rsquo;s name, and the first names of
          people who have joined. Please don&rsquo;t put private information in a meetup. On meetups where
          the host approves each person, the exact venue and address, the list of who&rsquo;s going, and
          any group chat link are visible only to the host and approved guests. Requests to join,
          including any note a person adds, are visible only to the host and the person who made the
          request.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Feedback</h2>
        <p className="text-ink/90">
          After a meetup, guests can answer one question: would you join a meetup like this again? Your
          individual answer is private, even from the host. Only totals are shown, for example
          &ldquo;9 of 10 guests would join again&rdquo; on a host&rsquo;s profile card. There are no written
          reviews.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Emails we send</h2>
        <p className="text-ink/90">
          Besides your login code, we email you when someone asks to join your meetup, when a host answers
          your request, when a meetup you were going to is cancelled, the day before a meetup you&rsquo;re part of, and
          the day after to ask how it went. You can turn all of these off on the Me tab. Emails go only to the address you signed up
          with, and we never share it.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Your bio and social profiles</h2>
        <p className="text-ink/90">
          You can add a short bio and the usernames of your LinkedIn, Instagram, X, TikTok and Facebook
          profiles. It&rsquo;s optional. Only you, and the hosts of meetups you join or ask to join, can see
          it. If you cancel a request or leave a meetup, that host can no longer see it. We store only
          usernames, never pasted links, and the links shown to hosts always go to that app&rsquo;s own site.
          You can change or clear it any time on the Me tab.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Push notifications</h2>
        <p className="text-ink/90">
          If you turn on push notifications, your browser gives us an address for your device so we can
          send you notifications. We use it only for that, and we remove it when you turn notifications
          off or log out on that device.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Cookies</h2>
        <p className="text-ink/90">
          We use one essential cookie to keep you logged in. We don&rsquo;t use advertising cookies.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Who handles your data</h2>
        <p className="text-ink/90">
          BayMeet runs on Supabase (database and login), Vercel (hosting and analytics), and an email
          provider that delivers your login code. We don&rsquo;t sell your data.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Deleting your data</h2>
        <p className="text-ink/90">
          You can delete any meetup you host from its page, and leave any meetup you joined. To delete
          your account and everything tied to it,{" "}
          {CONTACT_EMAIL ? (
            <>
              email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-accent-dark underline">
                {CONTACT_EMAIL}
              </a>{" "}
              from the address you signed up with.
            </>
          ) : (
            "contact the site owner from the address you signed up with."
          )}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Age</h2>
        <p className="text-ink/90">BayMeet is intended for people 18 and older.</p>
      </section>
    </article>
  );
}

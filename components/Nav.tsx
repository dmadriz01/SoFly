"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ITEMS = [
  {
    href: "/",
    label: "Feed",
    isActive: (p: string) => p === "/" || (p.startsWith("/events/") && p !== "/events/new"),
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" {...stroke}>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5 10v10h14V10" />
      </svg>
    ),
  },
  {
    href: "/events/new",
    label: "Post",
    isActive: (p: string) => p === "/events/new",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" {...stroke}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
  {
    href: "/me",
    label: "Me",
    isActive: (p: string) => p === "/me",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" {...stroke}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
      </svg>
    ),
  },
];

function Badge({ count }: { count: number }) {
  return (
    <span
      aria-label={`${count} pending ${count === 1 ? "request" : "requests"}`}
      className="absolute -right-2 -top-1.5 min-w-[1.1rem] rounded-full bg-accent px-1 text-center text-[0.65rem] font-bold leading-[1.1rem] text-on-accent"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function BottomNav({ pending = 0 }: { pending?: number }) {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);
  // Publishes the bar's real height (home-indicator space included) as --nav-h so the swipe screen
  // can leave exactly that much room. The bar itself is the same on every screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () => document.documentElement.style.setProperty("--nav-h", `${el.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(publish);
    observer.observe(el, { box: "border-box" });
    return () => observer.disconnect();
  }, []);
  return (
    <nav
      ref={ref}
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-3">
        {ITEMS.map((item) => {
          const active = item.isActive(pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                {active && <span aria-hidden className="absolute inset-x-[30%] top-0 h-0.5 rounded-full bg-gold" />}
                <span className="relative">
                  {item.icon}
                  {item.href === "/me" && pending > 0 && <Badge count={pending} />}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function TopNav({ pending = 0 }: { pending?: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {ITEMS.map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              active ? "bg-accent-soft text-accent-dark" : "text-muted hover:text-ink"
            }`}
          >
            {item.label}
            {item.href === "/me" && pending > 0 && (
              <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-xs font-bold text-on-accent">
                {pending}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

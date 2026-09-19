import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { BottomNav, TopNav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "BayMeet",
  description: "Sports and social meetups around the San Francisco Bay Area.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbf8f3",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <header className="mx-auto flex max-w-2xl items-center justify-between px-4 pt-5">
          <Link href="/" className="text-xl font-bold tracking-tight">
            Bay<span className="text-accent">Meet</span>
          </Link>
          <TopNav />
        </header>
        <main className="mx-auto max-w-2xl px-4 pb-32 pt-6 md:pb-16">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}

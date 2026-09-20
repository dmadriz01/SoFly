import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/react";
import { Footer } from "@/components/Footer";
import { BottomNav, TopNav } from "@/components/Nav";
import { getPendingRequestCount } from "@/lib/requests";
import { SITE_NAME, SITE_URL, TAGLINE } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME}: meetups around the Bay Area`, template: `%s · ${SITE_NAME}` },
  description: TAGLINE,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME}: meetups around the Bay Area`,
    description: TAGLINE,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME}: meetups around the Bay Area`,
    description: TAGLINE,
  },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbf8f3",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pending = await getPendingRequestCount();
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <header className="mx-auto flex max-w-2xl items-center justify-between px-4 pt-5">
          <Link href="/" className="tap -ml-1 px-1 text-xl font-bold tracking-tight">
            Bay<span className="text-accent">Meet</span>
          </Link>
          <TopNav pending={pending} />
        </header>
        <main className="mx-auto max-w-2xl px-4 pb-10 pt-6">{children}</main>
        <Footer />
        <BottomNav pending={pending} />
        <Analytics />
      </body>
    </html>
  );
}

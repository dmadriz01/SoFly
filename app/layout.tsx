import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/react";
import { Footer } from "@/components/Footer";
import { Logo } from "@/components/Logo";
import { BottomNav, TopNav } from "@/components/Nav";
import { THEME_COLOR, iconUrl } from "@/lib/brand";
import { getPendingRequestCount } from "@/lib/requests";
import { SITE_NAME, SITE_URL, TAGLINE } from "@/lib/site";
import { THEME_COOKIE, readTheme } from "@/lib/theme";
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
  icons: {
    icon: [{ url: iconUrl(64), sizes: "64x64", type: "image/png" }],
    apple: [{ url: iconUrl(180), sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The colour of the bar around the page on a phone follows the device's light or dark setting.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pending = await getPendingRequestCount();
  // Light or dark if the person chose; otherwise nothing, and the screens follow the device.
  const theme = readTheme(cookies().get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-theme={theme}>
      <body className="min-h-screen font-sans">
        <header className="mx-auto flex max-w-2xl items-center justify-between px-4 pt-5">
          <Link href="/" className="tap -ml-1 px-1 text-xl font-bold tracking-tight">
            <Logo />
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

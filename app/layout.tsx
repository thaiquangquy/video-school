import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { ServiceWorkerRegistration } from "./service-worker-registration";

export const metadata: Metadata = {
  title: "Homeschool Video Tracker",
  description: "Track homeschool video lesson progress",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Video Tracker",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121316" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegistration />
        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" className="site-title">
              Homeschool Tracker
            </Link>
            <nav className="site-nav">
              <Link href="/">Home</Link>
              <Link href="/library">Library</Link>
              <Link href="/history">History</Link>
            </nav>
          </div>
        </header>
        <main className="site-main">{children}</main>
      </body>
    </html>
  );
}

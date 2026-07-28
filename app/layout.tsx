import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Homeschool Video Tracker",
  description: "Track homeschool video lesson progress",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
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

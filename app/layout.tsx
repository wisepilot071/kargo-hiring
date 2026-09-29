import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kargo Hiring Dashboard",
  description: "AI-assisted candidate review for Kargo. You make the final decision.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-950 font-sans antialiased">
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 sm:px-6">
          <header className="flex items-center justify-between border-b border-black/[0.06] py-5">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-700 text-xs font-bold text-white">
                K
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-ink-100">Kargo</span>
              <span className="text-sm text-ink-500">Hiring</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/" className="rounded-lg px-3 py-1.5 text-ink-400 transition-colors hover:bg-black/[0.04] hover:text-ink-100">
                Dashboard
              </Link>
              <Link href="/audit" className="rounded-lg px-3 py-1.5 text-ink-400 transition-colors hover:bg-black/[0.04] hover:text-ink-100">
                Audit log
              </Link>
            </nav>
          </header>
          <main className="flex-1 py-8">{children}</main>
          <footer className="border-t border-black/[0.06] py-4 text-xs text-ink-500">
            The system recommends. Arjun decides.
          </footer>
        </div>
      </body>
    </html>
  );
}

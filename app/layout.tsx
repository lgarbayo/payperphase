import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { WordmarkMark } from "@/components/brand/Wordmark";
import { DirectorMode } from "@/components/director/DirectorMode";
import { ShellCompliance } from "@/components/shell/ShellCompliance";
import { LocaleProvider } from "@/i18n";
import { LocaleToggle } from "@/lib/ui/LocaleToggle";
import { ToastProvider } from "@/lib/ui/Toast";
import "./globals.css";

/** Scaffold-owned app shell. The compliance line must stay visible on every page (binding rule). */
export const metadata: Metadata = {
  title: "PayPerPhase",
  description: "Pay for dental treatment phase by phase, as you receive it. Never in advance.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-bg text-ink">
        <LocaleProvider>
          <ToastProvider>
            <div className="flex min-h-screen flex-col">
              <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-3">
                <a href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight text-primary-strong">
                  <WordmarkMark size={22} />
                  PayPerPhase
                </a>
                <LocaleToggle />
              </header>
              <div className="flex-1">{children}</div>
              {/* WP-14 owns DirectorMode (renders only with ?director=1). */}
              <Suspense fallback={null}>
                <DirectorMode />
              </Suspense>
              <footer className="border-t border-border bg-surface px-6 py-2">
                <ShellCompliance />
              </footer>
            </div>
          </ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}

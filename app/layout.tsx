import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "./_pwa/sw-register";
import { OfflineBanner } from "./_pwa/offline-banner";

export const metadata: Metadata = {
  title: "Numara",
  description: "A personal net worth tracker built around document capture.",
  applicationName: "Numara",
  appleWebApp: {
    capable: true,
    title: "Numara",
    // "default" keeps the iOS status bar legible on light backgrounds;
    // we'll swap to "black-translucent" once we ship a dark theme.
    statusBarStyle: "default",
  },
  formatDetection: {
    // Telephone-number autodetection turns rendered balances into tap-to-
    // call links on iOS — clearly wrong for a finance app.
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Prevent the iOS "double tap to zoom" delay without locking out the
  // accessibility pinch zoom (maximumScale is left at default).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-50">
        <OfflineBanner />
        {children}
        <SwRegister />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ExtensionScrubber } from "@/components/ExtensionScrubber";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "9Gaharuuu",
    template: "%s · 9Gaharuuu",
  },
  description: "Ruang kelas yang lebih tenang. Bagi, balas, tanpa perlu jadi terlihat.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

/**
 * `suppressHydrationWarning` on `<html>` and `<body>` absorbs attributes that a
 * browser extension adds to the document before React hydrates -- Bisect and Epic DOM
 * both stamp their own, and neither is present in the server's HTML.
 *
 * Scope worth knowing: React honours the flag for that element only, not for its
 * subtree. So this covers the document roots, `AppShell` covers its two wrappers, and
 * an extension that reaches further down the tree would still be reported --
 * which is what Bisect does when it marks every element it inspects.
 * `ExtensionScrubber` is what covers that case; these flags stay for the
 * extensions that stamp the document roots before that script can run.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="font-sans min-h-full">
        <ExtensionScrubber />
        {children}
      </body>
    </html>
  );
}

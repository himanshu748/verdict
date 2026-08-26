import type { Metadata } from "next";
import { Space_Grotesk, Space_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const sans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

const mono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-space-mono",
  weight: ["400", "700"],
});

const themeScript = `
  (() => {
    try {
      const stored = localStorage.getItem("verdict-theme");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.classList.toggle("dark", stored ? stored === "dark" : prefersDark);
    } catch {
      document.documentElement.classList.add("dark");
    }
  })();
`;

const configuredSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.VERCEL_PROJECT_PRODUCTION_URL ??
  process.env.VERCEL_URL ??
  "http://localhost:3000";
const metadataBase = new URL(
  configuredSiteUrl.startsWith("http://") || configuredSiteUrl.startsWith("https://")
    ? configuredSiteUrl
    : `https://${configuredSiteUrl}`,
);

export const metadata: Metadata = {
  applicationName: "Verdict",
  metadataBase,
  title: {
    default: "Verdict | Evidence-first bug reproduction",
    template: "%s | Verdict",
  },
  description:
    "Turn a flaky GitHub issue into reproducible conditions, a commit-level suspect range and an approval-gated regression plan.",
  openGraph: {
    description:
      "Turn a flaky GitHub issue into reproducible conditions, a commit-level suspect range and an approval-gated regression plan.",
    siteName: "Verdict",
    title: "Bugs are innocent until reproduced.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    description:
      "Turn a flaky GitHub issue into reproducible conditions, a commit-level suspect range and an approval-gated regression plan.",
    title: "Verdict | Evidence-first bug reproduction",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

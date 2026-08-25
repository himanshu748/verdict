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

export const metadata: Metadata = {
  title: "Verdict | Evidence-first bug reproduction",
  description:
    "Turn an intermittent issue into tested evidence and an approval-gated handoff.",
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

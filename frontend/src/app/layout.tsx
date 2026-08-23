import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";
import Providers from "./providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Starlight S.S Meeting Summarizer",
  description: "Meeting recording, attendance, transcription and official minutes for Starlight Secondary School.",
  manifest: "/manifest.webmanifest?v=9",
  icons: {
    icon: [
      { url: "/api/settings/logo?v=9", type: "image/jpeg", sizes: "any" },
      { url: "/starlight-logo.jpg?v=9", type: "image/jpeg", sizes: "any" },
    ],
    shortcut: "/api/settings/logo?v=9",
    apple: "/api/settings/logo?v=9",
  },
  appleWebApp: {
    capable: true,
    title: "Starlight Meetings",
    statusBarStyle: "default",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
    <head>
      <link rel="icon" href="/api/settings/logo?v=9" />
      <link rel="shortcut icon" href="/api/settings/logo?v=9" />
      <link rel="apple-touch-icon" href="/api/settings/logo?v=9" />
    </head>
    <body className="min-h-full flex flex-col bg-[#f9fafb]"><Providers>{children}</Providers></body>
  </html>;
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";
import Providers from "./providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Starlight S.S Meeting Summarizer",
  description: "Meeting recording, attendance, transcription and official minutes for Starlight Secondary School.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/starlight-logo.jpg?v=7", type: "image/jpeg" }],
    shortcut: "/starlight-logo.jpg?v=7",
    apple: "/starlight-logo.jpg?v=7",
  },
  appleWebApp: {
    capable: true,
    title: "Starlight Meetings",
    statusBarStyle: "default",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
    <body className="min-h-full flex flex-col bg-[#f9fafb]"><Providers>{children}</Providers></body>
  </html>;
}

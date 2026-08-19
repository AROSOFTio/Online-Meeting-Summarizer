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
    icon: [{ url: "/app-icon.jpg?v=5", type: "image/jpeg" }],
    shortcut: "/app-icon.jpg?v=5",
    apple: "/app-icon.jpg?v=5",
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

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";
import Providers from "./providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MinuteSeal",
  description: "Meeting recording, attendance, transcription and professional minutes for every organization.",
  manifest: "/manifest.webmanifest?v=11",
  icons: { icon: "/minuteseal.svg", shortcut: "/minuteseal.svg" },
  appleWebApp: {
    capable: true,
    title: "MinuteSeal",
    statusBarStyle: "default",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
    <head><link rel="stylesheet" href="/minuteseal-public.css?v=2"/></head>
    <body className="min-h-full flex flex-col bg-[#f9fafb]"><Providers>{children}</Providers></body>
  </html>;
}

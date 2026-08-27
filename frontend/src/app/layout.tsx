import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";
import Providers from "./providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "ConveneCore",
    template: "%s · ConveneCore",
  },
  description: "AI-powered hybrid meeting intelligence, professional minutes and action management for organizations worldwide.",
  manifest: "/manifest.webmanifest?v=10",
  icons: {
    icon: [{ url: "/convenecore-mark.svg?v=10", type: "image/svg+xml", sizes: "any" }],
    shortcut: "/convenecore-mark.svg?v=10",
    apple: "/convenecore-mark.svg?v=10",
  },
  appleWebApp: {
    capable: true,
    title: "ConveneCore",
    statusBarStyle: "default",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
    <head>
      <link rel="icon" href="/convenecore-mark.svg?v=10" type="image/svg+xml" />
      <link rel="shortcut icon" href="/convenecore-mark.svg?v=10" />
      <link rel="apple-touch-icon" href="/convenecore-mark.svg?v=10" />
    </head>
    <body className="min-h-full flex flex-col bg-[#f9fafb]"><Providers>{children}</Providers></body>
  </html>;
}

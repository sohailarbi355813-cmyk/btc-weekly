import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./week-pattern.css";
import "./wolf-levels.css";
import "./alts-tape.css";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "BTC Weekly — Wolf Terminal",
  description: "Bitcoin weekly directional bias, key auction levels, session probabilities, and market radar.",
  keywords: "btc weekly, wolf tape, key levels, pdh, pdl, pwh, pwl, weekly open, bitcoin levels",
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    title: "BTC Weekly — Wolf Terminal",
    description: "Bitcoin weekly directional bias, key levels, and statistical market structure.",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" className="theme-dark" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}

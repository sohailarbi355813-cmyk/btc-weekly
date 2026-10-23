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
  title: "Wolf Tape Reader — Key Levels, Statistical Tape & Alts Radar",
  description: "Wolf Tape Reader: Real-time key levels, auction price ladder, previous week high/low, relative strength alts tape, and statistical trading patterns. Trading the tape, with precision.",
  keywords: "wolf tape read, btc levels, key levels, pdh, pdl, pwh, pwl, weekly open, orderflow, bitcoin, crypto tape reading",
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    title: "Wolf Tape Read",
    description: "Wolf Tape Read: Institutional key levels, auction price ladder, and statistical patterns for Bitcoin.",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}

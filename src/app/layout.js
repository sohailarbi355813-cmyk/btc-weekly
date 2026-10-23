import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./week-pattern.css";
import "./wolf-levels.css";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "BTC Bias Helper — Statistical Trading Bias for Bitcoin",
  description: "Discover today's Bitcoin trading bias using statistical analysis of historical data from 2021. Day-of-week patterns, weekly open bias, and seasonal tendencies — all in one dashboard.",
  keywords: "bitcoin, btc, trading bias, day of week analysis, crypto statistics, trading helper",
  openGraph: {
    title: "BTC Bias Helper",
    description: "Statistical Bitcoin trading bias helper powered by historical data from 2021.",
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

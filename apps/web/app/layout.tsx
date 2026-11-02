import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

export const dynamic = "force-dynamic";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "VETTO — your DeFi banker. Every move checked.",
  description: "Natural-language DeFi on Robinhood Chain. Real routes only, safety checks first, and nothing moves without your signature.",
  robots: { index: false }, // working brand, not cleared — keep out of search until it is
};
export const viewport: Viewport = { themeColor: "#06041a", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

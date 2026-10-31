
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "VETTO — Your Independent DeFi Banker",
    template: "%s | VETTO",
  },
  description:
    "VETTO is an independent DeFi banker agent for Robinhood Chain. Explore decentralized finance through natural language, transparent transaction plans, and user-controlled execution.",
  applicationName: "VETTO",
  keywords: [
    "VETTO",
    "DeFi Agent",
    "Robinhood Chain",
    "Decentralized Finance",
    "AI Finance Agent",
    "DeFi Automation",
    "DeFi Transaction Agent",
  ],
  authors: [{ name: "VETTO" }],
  openGraph: {
    type: "website",
    title: "VETTO — Your Independent DeFi Banker",
    description:
      "A smarter way to understand, plan, and interact with decentralized finance.",
    siteName: "VETTO",
  },
  twitter: {
    card: "summary_large_image",
    title: "VETTO — Your Independent DeFi Banker",
    description:
      "Understand, plan, and interact with decentralized finance through VETTO.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0c",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

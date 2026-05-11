import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/header";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "IndexForge",
    template: "%s | IndexForge",
  },
  description:
    "Design, backtest, and publish on-chain thematic crypto indexes with SoSoValue, AI, SSI Protocol, and SoDEX.",
  applicationName: "IndexForge",
  generator: "IndexForge",
  keywords: [
    "IndexForge",
    "crypto index",
    "SoSoValue",
    "SoDEX",
    "SSI Protocol",
    "ValueChain",
    "AI portfolio",
  ],
  openGraph: {
    title: "IndexForge",
    description:
      "Forge thematic crypto indexes from live SoSoValue data and OpenAI weighting.",
    type: "website",
    siteName: "IndexForge",
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/apple-icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <Header />
        {children}
      </body>
    </html>
  );
}

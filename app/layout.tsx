import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: {
    default: "IndexForge",
    template: "%s | IndexForge",
  },
  description:
    "Design, validate, publish draft thematic crypto indexes with SoSoValue, SoSoValue Indexes, transparent weighting, creator profiles, and SoDEX testnet simulation.",
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
      "Forge thematic crypto indexes from live SoSoValue data, SSI references, transparent weighting, creator profiles, and SoDEX testnet simulation.",
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
      <body suppressHydrationWarning>
        <Header />
        {children}
      </body>
    </html>
  );
}

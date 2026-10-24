import type { Metadata } from "next";
import "./globals.css";

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#0a0b0d" };

export const metadata: Metadata = {
  icons: { icon: "/zend.png", apple: "/zend.png" },
  title: "ZendFi | Live Volume",
  description: "Live mainnet transaction count and value processed on ZendFi.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zend + ZendFi | Live Volume",
  description: "Live mainnet transaction count and value processed across Zend and ZendFi.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

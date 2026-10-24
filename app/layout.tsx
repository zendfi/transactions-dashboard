import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
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

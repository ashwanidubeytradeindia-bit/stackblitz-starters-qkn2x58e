import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Biz Trade Mart | Find products and suppliers",
    template: "%s | Biz Trade Mart",
  },
  description: "Explore sample B2B product listings and supplier profiles across India. Biz Trade Mart buyer experience demo.",
  applicationName: "Biz Trade Mart",
  openGraph: {
    title: "Biz Trade Mart | Find products and suppliers",
    description: "Discover products from Indian suppliers and connect with businesses.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

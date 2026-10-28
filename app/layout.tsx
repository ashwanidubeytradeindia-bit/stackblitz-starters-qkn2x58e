import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'Biz Trade Mart | Business starts here', template: '%s | Biz Trade Mart' },
  description: 'Discover products and connect with businesses across India on Biz Trade Mart.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}

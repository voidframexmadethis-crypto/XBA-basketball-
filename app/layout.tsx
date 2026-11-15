import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-mono',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'CourtVision Pro Basketball',
  description:
    'Realistic 3D professional basketball arena simulation with full-body articulated players, authentic physics, broadcast scoreboard, and multi-input controls.',
  openGraph: {
    title: 'CourtVision Pro Basketball',
    description:
      'Realistic 3D professional basketball arena simulation with full-body articulated players, authentic physics, broadcast scoreboard, and multi-input controls.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CourtVision Pro Basketball',
    description:
      'Realistic 3D professional basketball arena simulation with full-body articulated players, authentic physics, broadcast scoreboard, and multi-input controls.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${barlowCondensed.variable} ${plusJakartaSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-[#090b10] text-slate-100 antialiased overflow-hidden select-none" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

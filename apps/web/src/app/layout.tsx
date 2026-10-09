import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Providers } from '@/components/providers';

// Fonts are bundled (see fonts/README.md): builds and pages never depend on
// reaching Google Fonts, which hospital networks often block.
const outfit = localFont({
  src: './fonts/OutfitVariable-latin.woff2',
  variable: '--font-outfit',
  weight: '100 900',
  display: 'swap',
});

const sans = localFont({
  src: './fonts/InterVariable-latin.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
  display: 'swap',
  fallback: ['system-ui', 'arial'],
});

const mono = localFont({
  src: './fonts/JetBrainsMonoVariable-latin.woff2',
  variable: '--font-geist-mono',
  weight: '100 800',
  display: 'swap',
  fallback: ['Consolas', 'monospace'],
});

export const metadata: Metadata = {
  title: 'BioTrakr | Healthcare Asset Management',
  description: 'Next-generation healthcare asset management with real-time tracking, predictive maintenance, and compliance automation.',
  keywords: ['healthcare', 'asset management', 'medical devices', 'RTLS', 'predictive maintenance', 'compliance'],
  authors: [{ name: 'BioTrakr Team' }],
  openGraph: {
    title: 'BioTrakr | Healthcare Asset Management',
    description: 'Next-generation healthcare asset management with real-time tracking, predictive maintenance, and compliance automation.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-surface-0 font-sans">
        <Providers>
          {/* Noise texture overlay */}
          <div className="noise-overlay" aria-hidden="true" />
          
          {/* Background gradient mesh */}
          <div className="fixed inset-0 gradient-mesh pointer-events-none" aria-hidden="true" />
          
          {/* Main content */}
          <div className="relative z-10">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}

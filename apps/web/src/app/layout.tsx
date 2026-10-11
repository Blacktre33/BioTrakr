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
  description: 'Medical equipment management for hospitals: device register, bedside safety checks by QR scan, problem reports, work orders and preventive maintenance.',
  keywords: ['healthcare', 'medical equipment', 'biomedical engineering', 'preventive maintenance', 'work orders'],
  authors: [{ name: 'BioTrakr Team' }],
  openGraph: {
    title: 'BioTrakr | Healthcare Asset Management',
    description: 'Medical equipment management for hospitals: device register, bedside safety checks by QR scan, problem reports, work orders and preventive maintenance.',
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
      <body className="min-h-screen bg-surface-0 font-sans print:bg-white">
        <Providers>
          {/* Noise texture overlay */}
          <div className="noise-overlay print:hidden" aria-hidden="true" />
          
          {/* Background gradient mesh */}
          <div className="fixed inset-0 gradient-mesh pointer-events-none print:hidden" aria-hidden="true" />
          
          {/* Main content */}
          <div className="relative z-10">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import { Outfit, JetBrains_Mono, Inter } from 'next/font/google';
// import localFont from 'next/font/local';
import './globals.css';
import { Providers } from '@/components/providers';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

// const geistSans = localFont({
//   src: './fonts/GeistVF.woff',
//   variable: '--font-geist-sans',
//   weight: '100 900',
//   display: 'swap',
//   fallback: ['system-ui', 'arial'],
// });

// const geistMono = localFont({
//   src: './fonts/GeistMonoVF.woff',
//   variable: '--font-geist-mono',
//   weight: '100 900',
//   display: 'swap',
//   fallback: ['Consolas', 'monospace'],
// });

const geistSans = Inter({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
});

const geistMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MedAsset Pro | Healthcare Asset Management',
  description: 'Next-generation healthcare asset management with real-time tracking, predictive maintenance, and compliance automation.',
  keywords: ['healthcare', 'asset management', 'medical devices', 'RTLS', 'predictive maintenance', 'compliance'],
  authors: [{ name: 'MedAsset Team' }],
  openGraph: {
    title: 'MedAsset Pro | Healthcare Asset Management',
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
    <html lang="en" className={`${outfit.variable} ${geistSans.variable} ${geistMono.variable} ${jetbrainsMono.variable}`}>
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

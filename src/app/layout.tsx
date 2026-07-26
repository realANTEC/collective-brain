import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import './globals.css';

/* ── Typography ────────────────────────────────────────────────────────────
   Three voices, no more:
     · Geist            — the structural voice. Variable, tight, neutral.
     · Instrument Serif — the editorial accent. Exactly one word per heading.
     · Geist Mono       — the instrument voice. Labels, indices, telemetry.
   `display: swap` plus preload keeps the first paint text-visible even on a
   cold cache; the fallback metrics are close enough that the swap is quiet. */

const sans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
  preload: true,
});

const mono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
  preload: true,
});

const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
  preload: true,
});

const SITE = {
  name: 'Collective Brain',
  title: 'Collective Brain — The AI That Learns Forever',
  description:
    "Every conversation becomes part of humanity's evolving intelligence. Collective Brain is a living knowledge graph refined by verified corrections, scientific literature, and expert validation — so knowledge compounds instead of resetting.",
  url: 'https://collectivebrain.ai',
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.title,
    template: '%s — Collective Brain',
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    'collective intelligence',
    'knowledge graph',
    'AI memory',
    'verified answers',
    'living citations',
    'community validation',
  ],
  authors: [{ name: SITE.name }],
  openGraph: {
    type: 'website',
    url: SITE.url,
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE.title,
    description: SITE.description,
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#050508',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${serif.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-void text-text-1 antialiased">
        {/* Keyboard users get past the fixed nav and the WebGL layer in one tab. */}
        <a
          href="#main"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:left-4 focus-visible:z-[200] focus-visible:rounded-full focus-visible:bg-text-1 focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-void"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

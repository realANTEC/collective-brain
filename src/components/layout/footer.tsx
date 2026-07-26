'use client';

import Link from 'next/link';
import { ArrowUp } from 'lucide-react';

import { scrollTo } from '@/components/providers/smooth-scroll';
import {
  Button,
  PulseDot,
  Reveal,
  StaggerGroup,
  StaggerItem,
  TextReveal,
} from '@/components/ui';
import { FOOTER, SITE, TELEMETRY } from '@/lib/content';
import { fadeIn, riseInFlat } from '@/lib/motion';
import { useDriftingValue } from '@/lib/hooks';
import { cn, formatFull } from '@/lib/utils';

const [MARK_HEAD, MARK_TAIL] = SITE.name.split(' ');
const NODES = TELEMETRY[0];

/**
 * Footer.
 *
 * Read as the closing spread of a printed piece rather than a sitemap: an
 * oversized wordmark sitting on its rule, three indexed columns separated by
 * hairlines instead of gaps, and a live readout that keeps the system feeling
 * switched on right up to the last pixel.
 */
export function Footer() {
  return (
    // z-10 puts the footer in the same content band as <main>; without it a
    // bare `relative` paints below the fixed WebGL canvas (z-1) and the
    // grain/vignette layer (z-2), so the core would composite over the wordmark.
    // Registered as a choreography anchor (index 9) even though it is not a
    // numbered section. Without it, sectionFloat clamps at the CTA keyframe and
    // the core stays at near-full brightness all the way down, washing out the
    // link columns. The scroll rail only maps the nine real sections, so index
    // 9 simply leaves no tick active here — which is correct.
    <footer
      data-section="footer"
      data-section-index={9}
      className="relative z-10 overflow-hidden border-t border-line"
    >
      {/* The one signature flourish down here: the survey grid resurfaces and
          then dissolves before it reaches the legal line. */}
      <div
        aria-hidden
        className="grid-lines mask-fade-b pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72"
        style={{
          background:
            'radial-gradient(52% 100% at 22% 0%, rgba(61,107,255,0.11), transparent 72%)',
        }}
      />

      <div className="gutter relative">
        {/* ── Wordmark band ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-10 border-b border-line pt-20 pb-12 md:flex-row md:items-end md:justify-between md:gap-16 md:pt-24">
          <div className="min-w-0">
            <h2 className="text-h1 font-sans font-medium">
              <TextReveal>
                <>
                  <span className="text-lume">{MARK_HEAD}</span>{' '}
                  <em className="text-accent-lume font-serif italic">
                    {MARK_TAIL}
                  </em>
                </>
              </TextReveal>
            </h2>

            <Reveal variants={fadeIn} delay={0.15}>
              <p className="mt-6 max-w-[38ch] text-sm text-text-3">
                {SITE.tagline}
              </p>
            </Reveal>
          </div>

          <Reveal variants={fadeIn} className="shrink-0 md:pb-2">
            <StatusCluster />
          </Reveal>
        </div>

        {/* ── Columns ───────────────────────────────────────────────────── */}
        <StaggerGroup
          className="grid grid-cols-1 border-b border-line md:grid-cols-3"
          gap={0.08}
        >
          {FOOTER.columns.map((column, i) => (
            <StaggerItem
              key={column.title}
              variants={riseInFlat}
              className={cn(
                'py-10 md:py-14',
                i > 0 && 'border-t border-line md:border-t-0 md:border-l',
                i > 0 && 'md:pl-8 lg:pl-14',
              )}
            >
              <div className="flex items-baseline gap-3">
                <span className="label tnum text-blue-soft/70">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="label">{column.title}</h3>
              </div>

              <ul className="mt-7 space-y-0.5">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.label}`}>
                    <FooterLink href={link.href} label={link.label} />
                  </li>
                ))}
              </ul>
            </StaggerItem>
          ))}
        </StaggerGroup>

        {/* ── Legal ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col-reverse items-start gap-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
          <p className="max-w-[64ch] text-xs text-text-3">{FOOTER.legal}</p>

          <span className="shrink-0">
            <Button
              variant="ghost"
              size="sm"
              icon={false}
              onClick={() => scrollTo(0)}
            >
              <span className="inline-flex items-center gap-2">
                Back to top
                <ArrowUp
                  className="size-3.5 transition-transform duration-500 ease-out-expo group-hover/btn:-translate-y-0.5"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </span>
            </Button>
          </span>
        </div>
      </div>
    </footer>
  );
}

/* -- Pieces ---------------------------------------------------------------- */

function StatusCluster() {
  const live = useDriftingValue(NODES.value, NODES.drift, 2800);

  return (
    <div className="flex flex-col gap-4 md:items-end">
      <div className="flex items-center gap-3">
        <PulseDot />
        <span className="label text-text-2">Core online</span>
      </div>

      <div className="flex items-baseline gap-2.5">
        <span className="tnum font-mono text-sm text-text-1">
          {formatFull(Math.round(live))}
        </span>
        <span className="text-xs text-text-3">{NODES.label.toLowerCase()}</span>
      </div>
    </div>
  );
}

/**
 * Footer links come in three shapes: in-page anchors that Lenis must drive,
 * real routes, and the placeholder `#` entries the concept copy carries.
 */
function FooterLink({ href, label }: { href: string; label: string }) {
  const className =
    'group inline-flex py-1.5 text-sm text-text-2 transition-colors duration-300 hover:text-text-1';

  const inner = (
    <span className="relative">
      {label}
      <span
        aria-hidden
        className={cn(
          'absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-current',
          'transition-transform duration-500 ease-out-expo group-hover:scale-x-100',
        )}
      />
    </span>
  );

  if (href.startsWith('#')) {
    return (
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault();
          if (href.length > 1) scrollTo(href);
        }}
        className={className}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}

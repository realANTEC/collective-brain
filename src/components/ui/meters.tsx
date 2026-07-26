'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn, formatCompact } from '@/lib/utils';
import { useCountUp, usePrefersReducedMotion } from '@/lib/hooks';
import { EASE, VIEWPORT } from '@/lib/motion';

/* -- Confidence -------------------------------------------------------------
   Confidence is the single most important number on an answer, so it gets a
   dedicated instrument rather than a percentage in body copy. Segments rather
   than a smooth bar: a continuous fill implies a precision the underlying
   score does not have, and discrete ticks read as a measurement. */

export function ConfidenceMeter({
  value,
  segments = 28,
  label = 'Confidence',
  className,
  showValue = true,
}: {
  value: number;
  segments?: number;
  label?: string;
  className?: string;
  showValue?: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const filled = Math.round((value / 100) * segments);

  return (
    <div className={cn('w-full', className)}>
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="label">{label}</span>
        {showValue && (
          <span className="tnum font-mono text-sm text-text-1">
            {value}
            <span className="text-text-3">%</span>
          </span>
        )}
      </div>

      <div
        className="flex h-6 items-end gap-[3px]"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        {Array.from({ length: segments }).map((_, i) => {
          const isFilled = i < filled;
          const isLeading = i === filled - 1;
          return (
            <motion.span
              key={i}
              // origin-bottom is a class, not a style: Framer owns the
              // `transform` property here and would overwrite an inline one.
              className={cn(
                'h-full flex-1 origin-bottom rounded-[1px]',
                isFilled ? 'bg-blue-soft' : 'bg-white/8',
                isLeading && 'shadow-[0_0_12px_1px_rgba(110,144,255,0.85)]',
              )}
              initial={reduced ? false : { scaleY: 0.18, opacity: 0.2 }}
              whileInView={{
                // Slight height variance across the filled range gives the
                // meter the texture of a real signal readout.
                scaleY: isFilled ? (i % 3 === 0 ? 1 : 0.72) : 0.34,
                opacity: 1,
              }}
              viewport={VIEWPORT}
              transition={{
                duration: 0.5,
                delay: reduced ? 0 : i * 0.016,
                ease: EASE.outExpo,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Compact radial confidence dial for headers. */
export function ConfidenceDial({
  value,
  size = 116,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const stroke = 2;
  const r = (size - stroke * 2) / 2 - 6;
  const circumference = 2 * Math.PI * r;
  const [ref, animated] = useCountUp(value, { duration: 1600 });

  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#dial-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={reduced ? false : { strokeDashoffset: circumference }}
          whileInView={{
            strokeDashoffset: circumference * (1 - value / 100),
          }}
          viewport={VIEWPORT}
          transition={{ duration: 1.6, ease: EASE.outExpo }}
          style={{ filter: 'drop-shadow(0 0 8px rgba(110,144,255,0.55))' }}
        />
        <defs>
          <linearGradient id="dial-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3d6bff" />
            <stop offset="55%" stopColor="#8a6bff" />
            <stop offset="100%" stopColor="#6ee7f5" />
          </linearGradient>
        </defs>
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          ref={ref as React.Ref<HTMLSpanElement>}
          className="tnum font-mono text-2xl text-text-1"
        >
          {Math.round(animated)}
        </span>
        <span className="label mt-1 text-[0.5625rem]">Confidence</span>
      </div>
    </div>
  );
}

/* -- Numbers ------------------------------------------------------------- */

export function Stat({
  value,
  suffix,
  prefix,
  label,
  decimals = 0,
  compact = false,
  className,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  decimals?: number;
  compact?: boolean;
  className?: string;
}) {
  const [ref, animated] = useCountUp(value, { decimals, duration: 1900 });

  const display = compact
    ? formatCompact(animated)
    : animated.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span
        ref={ref as React.Ref<HTMLSpanElement>}
        className="tnum text-h3 font-sans font-medium text-lume"
      >
        {prefix}
        {display}
        {suffix && <span className="text-blue-soft">{suffix}</span>}
      </span>
      <span className="text-xs text-text-3">{label}</span>
    </div>
  );
}

/* -- Status -------------------------------------------------------------- */

const STATUS_TONES = {
  merged: 'text-cyan border-cyan/25 bg-cyan/8',
  contested: 'text-amber border-amber/25 bg-amber/8',
  rejected: 'text-rose border-rose/25 bg-rose/8',
  replicated: 'text-cyan border-cyan/25 bg-cyan/8',
  'under review': 'text-amber border-amber/25 bg-amber/8',
  neutral: 'text-text-2 border-line-strong bg-white/4',
} as const;

export type StatusTone = keyof typeof STATUS_TONES;

export function StatusPill({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
        'font-mono text-[0.625rem] tracking-[0.14em] uppercase',
        STATUS_TONES[tone] ?? STATUS_TONES.neutral,
        className,
      )}
    >
      <span className="size-1 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

/** A live-looking indicator dot with an expanding ring. */
export function PulseDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2', className)} aria-hidden>
      <span className="animate-pulse-ring absolute inset-0 rounded-full bg-cyan/60" />
      <span className="relative inline-flex size-2 rounded-full bg-cyan shadow-[0_0_10px_rgba(110,231,245,0.9)]" />
    </span>
  );
}

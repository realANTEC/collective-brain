'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/lib/hooks';

/**
 * Seamless infinite marquee.
 *
 * The track is duplicated once and translated by exactly -50%, which is the
 * only way to get a truly seamless loop without measuring anything at runtime.
 * Duration scales with content length so a long list does not scroll faster
 * than a short one.
 *
 * Pauses on hover so the content stays readable, and stops entirely under
 * reduced-motion (a permanently sliding strip is a common vestibular trigger).
 */
export function Marquee({
  children,
  speed = 46,
  reverse = false,
  className,
  fade = true,
  pauseOnHover = true,
}: {
  children: ReactNode;
  /** Seconds for one full cycle. */
  speed?: number;
  reverse?: boolean;
  className?: string;
  fade?: boolean;
  pauseOnHover?: boolean;
}) {
  const reduced = usePrefersReducedMotion();

  if (reduced) {
    return (
      <div className={cn('flex gap-4 overflow-x-auto', className)}>
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group/marquee relative overflow-hidden',
        fade && 'mask-fade-x',
        className,
      )}
    >
      <div
        className={cn(
          'flex w-max',
          pauseOnHover && 'group-hover/marquee:[animation-play-state:paused]',
        )}
        style={{
          animation: `marquee-slide ${speed}s linear infinite`,
          animationDirection: reverse ? 'reverse' : 'normal',
        }}
      >
        <div className="flex shrink-0 items-stretch">{children}</div>
        <div className="flex shrink-0 items-stretch" aria-hidden>
          {children}
        </div>
      </div>

      <style>{`
        @keyframes marquee-slide {
          from { transform: translate3d(0, 0, 0); }
          to   { transform: translate3d(-50%, 0, 0); }
        }
      `}</style>
    </div>
  );
}

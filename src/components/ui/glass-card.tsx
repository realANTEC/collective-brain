'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useTilt } from '@/lib/hooks';

/**
 * The house surface.
 *
 * Tilt is applied via CSS custom properties written by useTilt rather than
 * inline React state, which keeps the reconciler out of a 60fps loop. The
 * `perspective` lives on an outer wrapper so sibling cards each get their own
 * vanishing point - sharing one perspective across a grid makes cards at the
 * edges shear rather than tilt.
 */
export function GlassCard({
  children,
  className,
  innerClassName,
  tilt = 5,
  deep = false,
  glowOnHover = true,
  as: Component = 'div',
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  /** Max tilt in degrees. 0 disables it and keeps only the specular. */
  tilt?: number;
  /** Denser fill for panels sitting directly on the void. */
  deep?: boolean;
  glowOnHover?: boolean;
  as?: 'div' | 'article' | 'li';
}) {
  const ref = useTilt<HTMLDivElement>(tilt);

  return (
    <div className={cn('[perspective:1400px]', className)}>
      <Component
        ref={ref as React.Ref<HTMLDivElement & HTMLLIElement>}
        className={cn(
          'group/card relative h-full rounded-lg',
          deep ? 'glass-deep' : 'glass',
          'glass-specular',
          'transition-[border-color,box-shadow] duration-500',
          'ease-[cubic-bezier(0.16,1,0.3,1)]',
          glowOnHover && 'hover:border-white/14',
          innerClassName,
        )}
        style={{
          transform:
            'rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateZ(0)',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Hairline top edge highlight that brightens toward the pointer. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-60 transition-opacity duration-500 group-hover/card:opacity-100"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(255,255,255,0.28) var(--mx,50%), transparent)',
          }}
        />

        {glowOnHover && (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-px -z-10 rounded-[inherit] opacity-0 blur-xl transition-opacity duration-700 group-hover/card:opacity-100"
            style={{
              background:
                'radial-gradient(300px circle at var(--mx,50%) var(--my,50%), rgba(61,107,255,0.28), transparent 70%)',
            }}
          />
        )}

        {children}
      </Component>
    </div>
  );
}

/** A bare glass surface with no tilt - for panels that contain form controls. */
export function GlassPanel({
  children,
  className,
  deep = true,
}: {
  children: ReactNode;
  className?: string;
  deep?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative rounded-lg',
        deep ? 'glass-deep' : 'glass',
        className,
      )}
    >
      {children}
    </div>
  );
}

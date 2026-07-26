'use client';

import Link from 'next/link';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMagnetic } from '@/lib/hooks';
import { SPRING_SNAP } from '@/lib/motion';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface Ripple {
  id: number;
  x: number;
  y: number;
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-4 text-xs gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-14 px-7 text-[0.9375rem] gap-2.5',
};

/**
 * The house button.
 *
 * Four things happen on interaction, and each one has a reason:
 *   1. Magnetic lean  - the target acquires you before you reach it.
 *   2. Specular sweep - a highlight tracks the pointer across the surface.
 *   3. Ripple         - confirms the exact point of contact on press.
 *   4. Arrow shift    - directional affordance, only on hover.
 *
 * The magnetic transform lives on an outer wrapper, not the button itself, so
 * it never fights the press scale. Two transforms on one element is the usual
 * cause of jittery "premium" buttons.
 */
export function Button({
  children,
  href,
  onClick,
  variant = 'primary',
  size = 'md',
  className,
  icon = true,
  type = 'button',
  disabled,
  ariaLabel,
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  className?: string;
  icon?: boolean;
  type?: 'button' | 'submit';
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const magnetRef = useMagnetic<HTMLSpanElement>(
    variant === 'ghost' ? 0.18 : 0.3,
    variant === 'ghost' ? 50 : 80,
  );
  const surfaceRef = useRef<HTMLElement | null>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const rippleId = useRef(0);

  const spawnRipple = useCallback((e: React.PointerEvent) => {
    const el = surfaceRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const id = rippleId.current++;
    setRipples((rs) => [
      ...rs,
      { id, x: e.clientX - r.left, y: e.clientY - r.top },
    ]);
    // Self-cleaning: matches the exit duration below.
    setTimeout(() => setRipples((rs) => rs.filter((rp) => rp.id !== id)), 620);
  }, []);

  const trackSpecular = useCallback((e: React.PointerEvent) => {
    const el = surfaceRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  }, []);

  const base = cn(
    'group/btn relative inline-flex items-center justify-center overflow-hidden',
    'rounded-full font-medium tracking-[-0.01em] whitespace-nowrap',
    'transition-[color,background-color,border-color,box-shadow] duration-300',
    'ease-[cubic-bezier(0.16,1,0.3,1)]',
    'disabled:pointer-events-none disabled:opacity-40',
    SIZES[size],
  );

  const variants: Record<Variant, string> = {
    primary: cn(
      'bg-text-1 text-void',
      'shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_8px_24px_-6px_rgba(61,107,255,0.35)]',
      'hover:shadow-[0_1px_0_0_rgba(255,255,255,0.7)_inset,0_10px_38px_-6px_rgba(61,107,255,0.65)]',
    ),
    secondary: cn(
      'glass glass-specular text-text-1',
      'hover:border-white/16 hover:text-white',
    ),
    ghost: cn(
      'text-text-2 hover:text-text-1',
      'px-0 h-auto',
    ),
  };

  const content = (
    <>
      {/* Specular sweep, primary only - the glass variants get theirs from CSS. */}
      {variant === 'primary' && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover/btn:opacity-100"
          style={{
            background:
              'radial-gradient(120px circle at var(--mx,50%) var(--my,50%), rgba(61,107,255,0.22), transparent 65%)',
          }}
        />
      )}

      {/* Ripples */}
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            aria-hidden
            className={cn(
              'pointer-events-none absolute rounded-full',
              variant === 'primary' ? 'bg-blue/25' : 'bg-white/12',
            )}
            style={{ left: r.x, top: r.y, width: 12, height: 12, x: '-50%', y: '-50%' }}
            initial={{ scale: 0, opacity: 0.85 }}
            animate={{ scale: 22, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </AnimatePresence>

      <span className="relative z-10">{children}</span>

      {icon && (
        <ArrowRight
          className={cn(
            'relative z-10 shrink-0 transition-transform duration-500',
            'ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/btn:translate-x-1',
            size === 'lg' ? 'size-[18px]' : 'size-4',
          )}
          strokeWidth={1.75}
          aria-hidden
        />
      )}

      {/* Ghost variant: an underline that grows from the left. */}
      {variant === 'ghost' && (
        <span
          aria-hidden
          className={cn(
            'absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-current',
            'transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
            'group-hover/btn:scale-x-100',
          )}
        />
      )}
    </>
  );

  const handlers = {
    onPointerDown: spawnRipple,
    onPointerMove: trackSpecular,
  };

  return (
    <motion.span
      ref={magnetRef}
      className="inline-block"
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={SPRING_SNAP}
    >
      {href ? (
        <Link
          ref={surfaceRef as React.Ref<HTMLAnchorElement>}
          href={href}
          className={cn(base, variants[variant], className)}
          aria-label={ariaLabel}
          {...handlers}
        >
          {content}
        </Link>
      ) : (
        <button
          ref={surfaceRef as React.Ref<HTMLButtonElement>}
          type={type}
          onClick={onClick}
          disabled={disabled}
          className={cn(base, variants[variant], className)}
          aria-label={ariaLabel}
          {...handlers}
        >
          {content}
        </button>
      )}
    </motion.span>
  );
}

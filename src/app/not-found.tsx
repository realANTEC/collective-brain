import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Not found',
};

export default function NotFound() {
  return (
    <main className="gutter relative flex min-h-[100svh] flex-col items-center justify-center text-center">
      {/* A single soft glow keeps the void from reading as a broken page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(46% 38% at 50% 42%, rgba(61,107,255,0.14), transparent 70%)',
        }}
      />

      <span className="label tnum text-blue-soft/70">404</span>

      <h1 className="mt-6 text-h1 font-sans font-medium">
        <span className="text-lume">No claim exists at this</span>{' '}
        <em className="text-accent-lume font-serif italic">address.</em>
      </h1>

      <p className="measure mt-6 text-lead text-text-2">
        Nothing in the Core links here. The path may have been superseded, or it
        may never have been written.
      </p>

      <Link
        href="/"
        className="mt-10 inline-flex h-11 items-center gap-2 rounded-full bg-text-1 px-5 text-sm font-medium text-void transition-shadow duration-500 ease-out-expo hover:shadow-[0_10px_38px_-6px_rgba(61,107,255,0.65)]"
      >
        Return to the Core
      </Link>
    </main>
  );
}

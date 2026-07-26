import type { ReactNode } from 'react';

import { PointerBridge } from '@/components/providers/pointer-bridge';
import { SmoothScroll } from '@/components/providers/smooth-scroll';

/**
 * The answer page runs without the WebGL core, but it still needs both shared
 * providers: SmoothScroll owns the single scroll clock every reveal is timed
 * against, and PointerBridge is what decays `scene.searchPulse` back to zero —
 * without it a `pulseScene()` call would latch on forever.
 *
 * Both are client components; this layout stays a server component so the
 * route's static shell is not dragged into the client bundle.
 */
export default function AnswerLayout({ children }: { children: ReactNode }) {
  return (
    <SmoothScroll>
      <PointerBridge />
      {children}
    </SmoothScroll>
  );
}

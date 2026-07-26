import { SmoothScroll } from '@/components/providers/smooth-scroll';
import { PointerBridge } from '@/components/providers/pointer-bridge';
import { SectionTracker } from '@/components/providers/section-tracker';
import { KnowledgeCoreScene } from '@/components/three';

import { Atmosphere } from '@/components/overlays/atmosphere';
import { Preloader } from '@/components/overlays/preloader';
import { Cursor } from '@/components/overlays/cursor';
import { CommandPalette } from '@/components/overlays/command-palette';
import { AmbientAudio } from '@/components/overlays/ambient-audio';

import { Nav } from '@/components/layout/nav';
import { ScrollRail } from '@/components/layout/scroll-rail';
import { Footer } from '@/components/layout/footer';

import { Hero } from '@/components/sections/hero';
import { CoreSection } from '@/components/sections/core';
import { ConnectionsSection } from '@/components/sections/connections';
import { ConvergenceSection } from '@/components/sections/convergence';
import { GraphSection } from '@/components/sections/graph';
import { MemorySection } from '@/components/sections/memory';
import { ValidationSection } from '@/components/sections/validation';
import { PricingSection } from '@/components/sections/pricing';
import { CtaSection } from '@/components/sections/cta';

/**
 * The landing page.
 *
 * This stays a Server Component: none of the composition needs client state.
 * The interactive pieces are individually client components, and the WebGL
 * layer is behind a `dynamic(..., { ssr: false })` inside a client module — so
 * the HTML for every section still streams from the server and the page is
 * readable before three.js has finished downloading.
 *
 * Stacking order, back to front:
 *   z-0   Atmosphere      gradients, grid, grain, vignette
 *   z-1   KnowledgeCore   the persistent WebGL canvas
 *   z-10  content         sections, nav, footer
 *   z-20  search scrim    masked blur while the field is focused
 *   z-40+ overlays        palette, cursor, preloader
 */
export default function Page() {
  return (
    <SmoothScroll>
      <PointerBridge />
      <SectionTracker />

      <Atmosphere />
      <KnowledgeCoreScene />

      <Preloader />
      <Cursor />
      <CommandPalette />
      <AmbientAudio />

      <Nav />
      <ScrollRail />

      <main id="main" className="relative z-10">
        <Hero />
        <CoreSection />
        <ConnectionsSection />
        <ConvergenceSection />
        <GraphSection />
        <MemorySection />
        <ValidationSection />
        <PricingSection />
        <CtaSection />
      </main>

      <Footer />
    </SmoothScroll>
  );
}

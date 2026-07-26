'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';

import { KnowledgeCore } from './KnowledgeCore';
import { attachOrbitControls } from './interaction';
import { useDeviceTier, usePrefersReducedMotion } from '@/lib/hooks';
import { scene as sceneState, setQuality, type QualityTier } from '@/lib/scene-state';

/**
 * Frame-time watchdog.
 *
 * Device-tier detection guesses from static hardware signals; this measures
 * what is actually happening. If we spend 90 consecutive frames above the
 * budget we drop a tier, which rebuilds the geometry at a lower density.
 * Downgrades are one-way within a session — oscillating between tiers is far
 * more noticeable than simply running at the lower one.
 */
function PerformanceGuard({ onDowngrade }: { onDowngrade: () => void }) {
  const overBudget = useRef(0);
  const warmup = useRef(0);

  useFrame((_, delta) => {
    // Ignore the first ~90 frames: shader compilation and texture upload make
    // early frames unrepresentatively slow.
    if (warmup.current < 90) {
      warmup.current++;
      return;
    }

    if (delta > 0.021) {
      overBudget.current++;
      if (overBudget.current > 90) {
        overBudget.current = 0;
        warmup.current = 0;
        onDowngrade();
      }
    } else {
      overBudget.current = Math.max(0, overBudget.current - 2);
    }
  });

  return null;
}

const DPR: Record<QualityTier, [number, number]> = {
  high: [1, 1.75],
  medium: [1, 1.4],
  low: [1, 1],
};

/**
 * The persistent WebGL layer.
 *
 * One canvas for the entire site, fixed behind the document. It is never
 * unmounted between sections — that continuity is precisely what makes the
 * scroll read as a single camera move instead of nine separate scenes.
 */
export default function SceneCanvas() {
  const detected = useDeviceTier();
  const reduced = usePrefersReducedMotion();
  const [tier, setTier] = useState<QualityTier>(detected);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setTier(detected), [detected]);

  useEffect(() => {
    setQuality(tier);
  }, [tier]);

  const downgrade = () =>
    setTier((current) => {
      const next: QualityTier =
        current === 'high' ? 'medium' : current === 'medium' ? 'low' : 'low';
      if (next !== current) {
        // eslint-disable-next-line no-console
        console.info(
          `[collective-brain] frame budget exceeded — quality → ${next}`,
        );
      }
      return next;
    });

  // Bloom is the single most expensive thing in the scene and the first thing
  // to go. The procedural halo baked into every point shader means the scene
  // still glows convincingly without it.
  const bloomEnabled = tier === 'high' && !reduced;

  return (
    <div
      ref={containerRef}
      // z-1 sits above the Atmosphere's gradient/grid layers (z-0) and below
      // page content (z-10), so the core is embedded in the fog rather than
      // pasted on top of it.
      className="pointer-events-none fixed inset-0 z-[1]"
      aria-hidden="true"
    >
      <Canvas
        // `flat` = NoToneMapping. ACES would compress exactly the blown-out
        // highlights that make additive particles read as light sources.
        flat
        dpr={DPR[tier]}
        gl={{
          antialias: false,
          alpha: true,
          stencil: false,
          depth: true,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: false,
        }}
        camera={{ position: [0, 0.35, 7.4], fov: 40, near: 0.08, far: 120 }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color('#050508'), 0);
        }}
      >
        <KnowledgeCore tier={tier} />
        <PerformanceGuard onDowngrade={downgrade} />

        {bloomEnabled && (
          <EffectComposer enableNormalPass={false}>
            <Bloom
              mipmapBlur
              intensity={0.72}
              luminanceThreshold={0.28}
              luminanceSmoothing={0.55}
              radius={0.72}
            />
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}

/**
 * A transparent drag target that grants direct manipulation of the core.
 *
 * Rendered *inside* the sections that invite interaction rather than over the
 * whole page: a full-viewport grab surface would swallow pointer events meant
 * for text selection and links everywhere else.
 */
export function CoreDragSurface({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [grabbing, setGrabbing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const detach = attachOrbitControls(el);

    const down = () => setGrabbing(true);
    const up = () => setGrabbing(false);
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);

    return () => {
      detach();
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      data-grabbing={grabbing || undefined}
      // touch-action:none is required or the browser claims the gesture for
      // scrolling before our pointermove handler ever sees it.
      style={{ touchAction: 'none' }}
      role="presentation"
    />
  );
}

/** Re-exported so DOM components can fire a light wave without importing three. */
export { sceneState };

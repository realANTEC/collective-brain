'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import {
  buildConceptNodes,
  buildConnections,
  buildCorePoints,
  buildDust,
} from './geometry';
import {
  connectionsFragment,
  connectionsVertex,
  corePointsFragment,
  corePointsVertex,
  dustFragment,
  dustVertex,
  nodesFragment,
  nodesVertex,
  nucleusFragment,
  nucleusVertex,
} from './shaders';
import {
  buildConceptNodesFromSemantic,
  buildCorePointsFromSemantic,
  loadSemanticCore,
  type SemanticData,
} from './semantic-core';
import {
  FLOW_SIZE,
  FLOW_TILES,
  loadFlowField,
  neutralFlowTexture,
} from './flow-field';
import { sampleChoreography } from './choreography';
import { orbit, stepOrbitInertia } from './interaction';
import { scene as sceneState, type QualityTier } from '@/lib/scene-state';
import { clamp, damp } from '@/lib/utils';

/* ══════════════════════════════════════════════════════════════════════════
   QUALITY PRESETS
   ──────────────────────────────────────────────────────────────────────────
   The visual language survives the drop from 42k points to 7k because the
   composition — shell, strata, arcs, nucleus — is structural rather than
   density-dependent. What changes is fidelity, not identity.
   ══════════════════════════════════════════════════════════════════════════ */

export const PRESETS: Record<
  QualityTier,
  {
    points: number;
    nodes: number;
    arcs: number;
    segments: number;
    dust: number;
    pointSize: number;
    nodeSize: number;
  }
> = {
  high: {
    points: 42000,
    nodes: 96,
    arcs: 220,
    segments: 22,
    dust: 2600,
    pointSize: 1.55,
    nodeSize: 6,
  },
  medium: {
    points: 18000,
    nodes: 72,
    arcs: 150,
    segments: 16,
    dust: 1300,
    pointSize: 1.9,
    nodeSize: 6.5,
  },
  low: {
    points: 6500,
    nodes: 44,
    arcs: 84,
    segments: 12,
    dust: 480,
    pointSize: 2.4,
    nodeSize: 7.5,
  },
};

const COLOR = {
  blue: new THREE.Color('#3d6bff'),
  blueSoft: new THREE.Color('#6e90ff'),
  blueDeep: new THREE.Color('#16307f'),
  violet: new THREE.Color('#8a6bff'),
  cyan: new THREE.Color('#6ee7f5'),
  dim: new THREE.Color('#243055'),
};

/* ══════════════════════════════════════════════════════════════════════════
   THE CORE
   ══════════════════════════════════════════════════════════════════════════ */

export function KnowledgeCore({ tier }: { tier: QualityTier }) {
  const preset = PRESETS[tier];
  const { camera, gl } = useThree();

  const groupRef = useRef<THREE.Group>(null);
  const dustRef = useRef<THREE.Points>(null);

  // One ref per ShaderMaterial. See the pinning effect below for why these
  // exist rather than relying on the `uniforms` prop alone.
  const coreMat = useRef<THREE.ShaderMaterial>(null);
  const connMat = useRef<THREE.ShaderMaterial>(null);
  const nodesMat = useRef<THREE.ShaderMaterial>(null);
  const nucleusMat = useRef<THREE.ShaderMaterial>(null);
  const dustMat = useRef<THREE.ShaderMaterial>(null);

  /* ── Geometry (built once per quality tier) ──────────────────────────── */

  /* ── Geometry ─────────────────────────────────────────────────────────────
     Real semantic positions when the embedding is available, procedural
     otherwise. The fallback is not a formality: the whole hero rides on this
     geometry, so a failed fetch has to degrade to a beautiful sphere rather
     than to nothing. The request starts when the module is imported, so it has
     normally landed while the preloader is still playing. */

  const [semantic, setSemantic] = useState<SemanticData | null>(null);

  useEffect(() => {
    let alive = true;
    loadSemanticCore().then((data) => {
      if (alive) setSemantic(data);
    });
    return () => {
      alive = false;
    };
  }, []);

  const core = useMemo(
    () =>
      semantic
        ? buildCorePointsFromSemantic(semantic, preset.points)
        : buildCorePoints(preset.points),
    [semantic, preset.points],
  );

  const nodes = useMemo(
    () =>
      semantic
        ? buildConceptNodesFromSemantic(semantic, preset.nodes).data
        : buildConceptNodes(preset.nodes),
    [semantic, preset.nodes],
  );

  /* ── Flow field ───────────────────────────────────────────────────────────
     The baked curl-noise volume that drives the shell's ambient motion. Held
     in a ref rather than in state: it changes nothing structural, so there is
     no reason to re-render the scene when it lands. Null until (and unless) it
     loads, which leaves uFlowAmt at 0 and the sin() fallback in charge.

     Applied to the dense point shell ONLY. The nodes and their arcs share one
     rigid rotation precisely so an arc cannot shear against its endpoints; a
     per-vertex displacement field is the same class of mistake with the same
     result. See the STRUCTURAL_SPIN note in shaders.ts. */

  const flowTex = useRef<THREE.Texture | null>(null);

  useEffect(() => {
    // Vertex texture fetch. WebGL2 guarantees at least 16 units, but a driver
    // reporting none would silently return black — which decodes to a constant
    // -1 pull on every axis rather than to no motion.
    if (gl.capabilities.maxVertexTextures < 1) return;

    let alive = true;
    loadFlowField().then((tex) => {
      if (alive) flowTex.current = tex;
    });
    return () => {
      alive = false;
    };
  }, [gl]);

  const connections = useMemo(
    () =>
      buildConnections(nodes, {
        maxArcs: preset.arcs,
        segments: preset.segments,
      }),
    [nodes, preset.arcs, preset.segments],
  );
  const dust = useMemo(() => buildDust(preset.dust), [preset.dust]);

  /* ── Uniforms (mutated in place; never re-created) ───────────────────── */

  const uniforms = useMemo(
    () => ({
      core: {
        uTime: { value: 0 },
        uReveal: { value: 0 },
        uPulse: { value: 0 },
        uWaveFront: { value: 0 },
        uVisibility: { value: 0.62 },
        uPointer: { value: new THREE.Vector3() },
        uPointerAmt: { value: 0 },
        uSize: { value: preset.pointSize },
        uDpr: { value: 1 },
        uScale: { value: 1 },
        uOpacity: { value: 0 },
        uColorA: { value: COLOR.blue.clone() },
        uColorB: { value: COLOR.violet.clone() },
        uColorC: { value: COLOR.cyan.clone() },
        // Flow field. The sampler is bound to a neutral 1x1 from the start so
        // it is never unbound, and uFlowAmt gates the shader's sampling
        // entirely — at 0 the shell moves exactly as it did before the asset
        // existed.
        uFlow: { value: neutralFlowTexture() as THREE.Texture },
        uFlowAmt: { value: 0 },
        uFlowSize: { value: FLOW_SIZE },
        uFlowTiles: { value: FLOW_TILES },
      },
      connections: {
        uTime: { value: 0 },
        uDraw: { value: 0 },
        uPulse: { value: 0 },
        uScale: { value: 1 },
        uOpacity: { value: 0 },
        uColorA: { value: COLOR.blueSoft.clone() },
        uColorB: { value: COLOR.violet.clone() },
      },
      nodes: {
        uTime: { value: 0 },
        uReveal: { value: 0 },
        uPulse: { value: 0 },
        uScale: { value: 1 },
        uSize: { value: preset.nodeSize },
        uDpr: { value: 1 },
        uPointer: { value: new THREE.Vector3() },
        uPointerAmt: { value: 0 },
        uOpacity: { value: 0 },
        uColorA: { value: COLOR.blueSoft.clone() },
        uColorB: { value: COLOR.cyan.clone() },
      },
      nucleus: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uOpacity: { value: 0 },
        uColorA: { value: COLOR.blueDeep.clone() },
        uColorB: { value: COLOR.blueSoft.clone() },
      },
      dust: {
        uTime: { value: 0 },
        uSize: { value: 2.2 },
        uDpr: { value: 1 },
        uReveal: { value: 0 },
        uPointer: { value: new THREE.Vector2() },
        uOpacity: { value: 0 },
        uColorA: { value: COLOR.dim.clone() },
        uColorB: { value: COLOR.blueSoft.clone() },
      },
    }),
    [preset.pointSize, preset.nodeSize],
  );

  /* ── Frame-local scratch objects (allocation-free render loop) ────────── */

  const scratch = useMemo(
    () => ({
      pointerWorld: new THREE.Vector3(),
      rayDir: new THREE.Vector3(),
      toOrigin: new THREE.Vector3(),
      closest: new THREE.Vector3(),
      lookTarget: new THREE.Vector3(),
      camPos: new THREE.Vector3(),
      reveal: 0,
      scale: 1,
      zoom: 1,
      opacity: 0,
    }),
    [],
  );

  /**
   * The uniform objects the GPU actually reads.
   *
   * This indirection is load-bearing. The `uniforms` memo above is only the
   * *initial* value handed to each material — the object a material ends up
   * holding is not guaranteed to be that same one. And three captures
   * `material.uniforms` once, when the program is first compiled, into its
   * internal material properties; every subsequent upload reads from that
   * captured reference.
   *
   * So two things are true at once, and both bite:
   *   - mutating the memo can leave the GPU reading a different object, and
   *   - reassigning `material.uniforms` after compile does NOT redirect the
   *     GPU, because the capture already happened.
   *
   * The only reliable target is the object the material is holding. We resolve
   * it once after mount and write through that from then on. Getting this
   * wrong renders the entire core invisible (uOpacity stays 0) while every
   * value you can inspect from React looks perfectly correct.
   */
  const live = useRef<typeof uniforms | null>(null);

  useEffect(() => {
    if (
      !coreMat.current ||
      !connMat.current ||
      !nodesMat.current ||
      !nucleusMat.current ||
      !dustMat.current
    ) {
      return;
    }

    live.current = {
      core: coreMat.current.uniforms as typeof uniforms.core,
      connections: connMat.current.uniforms as typeof uniforms.connections,
      nodes: nodesMat.current.uniforms as typeof uniforms.nodes,
      nucleus: nucleusMat.current.uniforms as typeof uniforms.nucleus,
      dust: dustMat.current.uniforms as typeof uniforms.dust,
    };

    const dpr = Math.min(gl.getPixelRatio(), 2);
    live.current.core.uDpr.value = dpr;
    live.current.nodes.uDpr.value = dpr;
    live.current.dust.uDpr.value = dpr;
  }, [gl, uniforms]);

  /* ── The single render-loop callback ─────────────────────────────────── */

  useFrame((state, rawDelta) => {
    // Cap delta so a tab-switch or a GC pause doesn't teleport the animation.
    const dt = Math.min(0.05, rawDelta);
    const t = state.clock.elapsedTime;

    // Read the drawing-buffer width rather than a media query so the scene
    // stays correct if the canvas is ever resized independently of the page.
    const narrow = state.size.width < 768;
    const cho = sampleChoreography(sceneState.sectionFloat, narrow);
    stepOrbitInertia(dt);

    /* ── Camera ──────────────────────────────────────────────────────────
       Choreography sets the anchor; pointer sway and a slow ambient float are
       added on top. The float is what keeps the frame alive during the long
       reading pauses — a perfectly still camera immediately reads as a static
       image, no matter how much the contents move. */
    const swayX = sceneState.smoothPointerX * 0.34 * cho.pointerInfluence;
    const swayY = sceneState.smoothPointerY * 0.22 * cho.pointerInfluence;
    const floatX = Math.sin(t * 0.13) * 0.09;
    const floatY = Math.cos(t * 0.097) * 0.07;

    scratch.camPos.set(
      cho.px + swayX + floatX,
      cho.py + swayY + floatY,
      cho.pz,
    );
    // Damp toward the sampled position rather than snapping: this absorbs the
    // micro-jitter that inertial scrolling injects into scrollProgress.
    camera.position.lerp(scratch.camPos, 1 - Math.exp(-9 * dt));

    scratch.lookTarget.set(cho.tx, cho.ty, cho.tz);
    camera.lookAt(scratch.lookTarget);

    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const cam = camera as THREE.PerspectiveCamera;
      const nextFov = damp(cam.fov, cho.fov, 7, dt);
      if (Math.abs(nextFov - cam.fov) > 0.001) {
        cam.fov = nextFov;
        cam.updateProjectionMatrix();
      }
    }

    /* ── Entrance ────────────────────────────────────────────────────────
       Held at zero until the preloader hands off, then ramps over ~2.6s. The
       shader spreads that ramp across per-point delays, so the assembly reads
       as roughly four seconds of settling. */
    if (sceneState.ready) {
      scratch.reveal = Math.min(1, scratch.reveal + dt / 2.6);
    }
    const reveal = scratch.reveal;

    /* ── Orbit + zoom ────────────────────────────────────────────────────── */
    orbit.zoom = damp(orbit.zoom, orbit.targetZoom, 6, dt);
    scratch.zoom = orbit.zoom;

    if (groupRef.current) {
      groupRef.current.rotation.y = orbit.yaw;
      groupRef.current.rotation.x = orbit.pitch;
    }

    /* ── Pointer → world position on the core's surface ──────────────────
       Unproject the cursor, then find the point on that ray closest to the
       origin and clamp it to the shell. The result is "where on the core the
       user is pointing", which is what the attraction and node-proximity
       terms both need. */
    scratch.pointerWorld
      .set(sceneState.smoothPointerX, sceneState.smoothPointerY, 0.5)
      .unproject(camera);
    scratch.rayDir.copy(scratch.pointerWorld).sub(camera.position).normalize();
    scratch.toOrigin.copy(camera.position).negate();
    const along = scratch.toOrigin.dot(scratch.rayDir);
    scratch.closest
      .copy(camera.position)
      .addScaledVector(scratch.rayDir, Math.max(0, along));
    if (scratch.closest.length() > 1.6) scratch.closest.setLength(1.6);
    // Into the core's local frame so drag rotation doesn't desync the cursor.
    if (groupRef.current) groupRef.current.worldToLocal(scratch.closest);

    const pointerAmt = sceneState.pointerActive
      ? cho.pointerInfluence * (sceneState.reducedMotion ? 0.25 : 1)
      : 0;

    /* ── Scale, opacity, pulse ───────────────────────────────────────────── */
    const pulse = sceneState.searchPulse;
    // Focusing the search field lifts the whole network to attention: nodes
    // brighten, connections warm, and the body swells fractionally. It is the
    // scene acknowledging that a question is coming.
    const focus = sceneState.searchFocus;

    scratch.scale = cho.coreScale * scratch.zoom * (1 + focus * 0.045);
    scratch.opacity = damp(scratch.opacity, cho.opacity, 5, dt);

    // Wave front travels outward as the impulse decays: front = (1-pulse)*R.
    const waveFront = (1 - pulse) * 3.4 * scratch.scale;

    // Population gate: baseline from choreography, permanently nudged upward
    // by each submitted query so the graph visibly grows as you use it.
    const growth = Math.min(0.24, sceneState.queryCount * 0.02);
    const population = clamp(cho.population + growth, 0, 1);

    /* ── Push to GPU ─────────────────────────────────────────────────────── */
    const u = live.current;
    if (!u) return;

    u.core.uTime.value = t;
    u.core.uReveal.value = reveal;
    u.core.uPulse.value = pulse;
    u.core.uWaveFront.value = waveFront;
    u.core.uVisibility.value = damp(
      u.core.uVisibility.value,
      population,
      3,
      dt,
    );
    u.core.uPointer.value.copy(scratch.closest);
    u.core.uPointerAmt.value = damp(u.core.uPointerAmt.value, pointerAmt, 6, dt);
    u.core.uScale.value = damp(u.core.uScale.value, scratch.scale, 7, dt);
    u.core.uOpacity.value = scratch.opacity * reveal;

    // Bind through the live uniform object, and keep checking: a quality
    // downgrade rebuilds the uniforms and would otherwise drop the atlas back
    // to the neutral 1x1. Ramping uFlowAmt rather than switching it means the
    // shell cross-fades from the sin() fallback into the field over ~2s
    // instead of visibly changing gear the moment the PNG lands.
    if (flowTex.current && u.core.uFlow.value !== flowTex.current) {
      u.core.uFlow.value = flowTex.current;
    }
    u.core.uFlowAmt.value = damp(
      u.core.uFlowAmt.value,
      flowTex.current ? 1 : 0,
      1.4,
      dt,
    );

    u.connections.uTime.value = t;
    u.connections.uDraw.value = damp(
      u.connections.uDraw.value,
      cho.connections * reveal,
      4,
      dt,
    );
    u.connections.uPulse.value = pulse + focus * 0.22;
    u.connections.uScale.value = u.core.uScale.value;
    u.connections.uOpacity.value = scratch.opacity * reveal;

    u.nodes.uTime.value = t;
    u.nodes.uReveal.value = reveal;
    u.nodes.uPulse.value = pulse + focus * 0.4;
    u.nodes.uScale.value = u.core.uScale.value;
    u.nodes.uPointer.value.copy(scratch.closest);
    u.nodes.uPointerAmt.value = u.core.uPointerAmt.value;
    u.nodes.uOpacity.value = scratch.opacity * reveal;

    u.nucleus.uTime.value = t;
    u.nucleus.uPulse.value = pulse;
    u.nucleus.uOpacity.value = scratch.opacity * reveal * 0.9;

    u.dust.uTime.value = t;
    u.dust.uReveal.value = reveal;
    u.dust.uPointer.value.set(
      sceneState.smoothPointerX * 0.35,
      sceneState.smoothPointerY * 0.28,
    );
    u.dust.uOpacity.value = 0.55 * reveal;

    if (dustRef.current) {
      // Dust counter-rotates very slowly against the core — the two motions
      // read as separate depth planes rather than one rotating object.
      dustRef.current.rotation.y = -t * 0.008;
    }
  });

  const nucleusScale = 0.92;

  return (
    <>
      {/* Ambient dust sits outside the rotating group so drag never moves it. */}
      <points ref={dustRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[dust.positions, 3]}
          />
          <bufferAttribute attach="attributes-aSeed" args={[dust.seeds, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={dustMat}
          vertexShader={dustVertex}
          fragmentShader={dustFragment}
          uniforms={uniforms.dust}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <group ref={groupRef}>
        {/* Nucleus — a back-faced fresnel shell that gives the core volume. */}
        <mesh scale={nucleusScale}>
          <icosahedronGeometry args={[1, 4]} />
          <shaderMaterial
            ref={nucleusMat}
            vertexShader={nucleusVertex}
            fragmentShader={nucleusFragment}
            uniforms={uniforms.nucleus}
            transparent
            depthWrite={false}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* The dense population. */}
        <points frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[core.positions, 3]}
            />
            <bufferAttribute
              attach="attributes-aScatter"
              args={[core.scatter, 3]}
            />
            <bufferAttribute attach="attributes-aSeed" args={[core.seeds, 1]} />
            <bufferAttribute
              attach="attributes-aRadius"
              args={[core.radii, 1]}
            />
          </bufferGeometry>
          <shaderMaterial
            ref={coreMat}
            vertexShader={corePointsVertex}
            fragmentShader={corePointsFragment}
            uniforms={uniforms.core}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>

        {/* Connections — one draw call for the whole network. */}
        <lineSegments frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[connections.positions, 3]}
            />
            <bufferAttribute
              attach="attributes-aProgress"
              args={[connections.progress, 1]}
            />
            <bufferAttribute
              attach="attributes-aSeed"
              args={[connections.seeds, 1]}
            />
            <bufferAttribute
              attach="attributes-aWeight"
              args={[connections.weights, 1]}
            />
          </bufferGeometry>
          <shaderMaterial
            ref={connMat}
            vertexShader={connectionsVertex}
            fragmentShader={connectionsFragment}
            uniforms={uniforms.connections}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>

        {/* Concept nodes — the addressable, hover-reactive layer. */}
        <points frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[nodes.positions, 3]}
            />
            <bufferAttribute
              attach="attributes-aSeed"
              args={[nodes.seeds, 1]}
            />
          </bufferGeometry>
          <shaderMaterial
            ref={nodesMat}
            vertexShader={nodesVertex}
            fragmentShader={nodesFragment}
            uniforms={uniforms.nodes}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      </group>
    </>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';
import { usePrefersReducedMotion, useSceneSnapshot } from '@/lib/hooks';

const STORAGE_KEY = 'cb:audio';

/** Base level. The LFO is *summed* into the same param, so the absolute
 *  ceiling is BASE_GAIN + LFO_DEPTH — that sum is the whole budget. */
const BASE_GAIN = 0.032;
const LFO_DEPTH = 0.018;

/** Distance from the document end at which the footer's legal line reaches
 *  the corner the toggle sits in. */
const END_ZONE = 120;

type AudioContextCtor = typeof AudioContext;

interface Drone {
  ctx: AudioContext;
  stop: () => void;
}

/**
 * A two-voice drone, synthesised from nothing.
 *
 * A root at 55Hz and its fifth at 82.5Hz, each detuned a few cents so the two
 * voices beat slowly against one another instead of sitting perfectly still,
 * folded through a lowpass at 180Hz to strip everything that would read as a
 * tone rather than a room. A 0.06Hz LFO breathes the output over ~17s.
 *
 * Zero network cost, zero audio files, and it can never loop audibly.
 */
function createDrone(): Drone | null {
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor })
      .webkitAudioContext;
  if (!Ctor) return null;

  const ctx = new Ctor();
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.linearRampToValueAtTime(BASE_GAIN, now + 2.4);
  master.connect(ctx.destination);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(180, now);
  filter.Q.setValueAtTime(0.6, now);
  filter.connect(master);

  const sources: OscillatorNode[] = [];

  for (const [freq, detune, level] of [
    [55, -7, 1],
    [82.5, 6, 0.42],
  ]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.detune.setValueAtTime(detune, now);

    const voice = ctx.createGain();
    voice.gain.setValueAtTime(level, now);

    osc.connect(voice).connect(filter);
    osc.start(now);
    sources.push(osc);
  }

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.06, now);
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(LFO_DEPTH, now);
  lfo.connect(depth);
  depth.connect(master.gain);
  lfo.start(now);
  sources.push(lfo);

  const stop = () => {
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
    master.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    sources.forEach((node) => node.stop(t + 1));
    window.setTimeout(() => void ctx.close(), 1200);
  };

  return { ctx, stop };
}

/** Per-bar keyframes, deliberately coprime-ish durations so the four bars
 *  never fall back into step with each other. */
const BARS: Array<{ frames: number[]; duration: number }> = [
  { frames: [0.26, 1, 0.44], duration: 1.7 },
  { frames: [0.72, 0.3, 0.95], duration: 2.3 },
  { frames: [0.44, 0.88, 0.24], duration: 1.9 },
  { frames: [0.9, 0.34, 0.62], duration: 2.7 },
];

/**
 * Ambience toggle.
 *
 * Docked bottom-left, on the page gutter — but only across the body of the
 * document. Both ends of the page claim that corner with full-bleed
 * instrumentation: the hero pins its telemetry bar to the bottom edge (two
 * rows, ~160px, below `md`) and the footer closes on an edge-to-edge legal
 * line, so a permanently pinned pill lands on a live readout at first paint and
 * on the small print at the last scroll. Rather than float it into the middle
 * of the hero — where a short viewport puts it straight through the search
 * field — it follows the ScrollRail's rule: page chrome stays out of a frame
 * the page has already claimed, and arrives the moment the reader commits.
 */
export function AmbientAudio() {
  const reduced = usePrefersReducedMotion();
  const { section } = useSceneSnapshot();
  const [on, setOn] = useState(false);
  const [armed, setArmed] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const droneRef = useRef<Drone | null>(null);

  const visible = section >= 1 && !atEnd;

  // A remembered preference can only *pre-arm* the control. Autoplay policy
  // requires a gesture, so restoring "on" without one would silently fail.
  useEffect(() => {
    setArmed(window.localStorage.getItem(STORAGE_KEY) === 'on');
  }, []);

  // The other contested end: the last inch of the document, where the footer's
  // legal line runs edge to edge through the corner. Only that final stretch is
  // taken, so the control stays available for the whole footer above it.
  useEffect(() => {
    const onScroll = () => {
      const remaining =
        document.documentElement.scrollHeight -
        (window.scrollY + window.innerHeight);
      setAtEnd(remaining < END_ZONE);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(
    () => () => {
      droneRef.current?.stop();
      droneRef.current = null;
    },
    [],
  );

  const toggle = useCallback(() => {
    setArmed(false);

    if (droneRef.current) {
      droneRef.current.stop();
      droneRef.current = null;
      setOn(false);
      window.localStorage.setItem(STORAGE_KEY, 'off');
      return;
    }

    // The context is constructed inside the gesture, never on mount — a
    // context created before the first interaction starts life suspended.
    const drone = createDrone();
    if (!drone) return;
    if (drone.ctx.state === 'suspended') void drone.ctx.resume();

    droneRef.current = drone;
    setOn(true);
    window.localStorage.setItem(STORAGE_KEY, 'on');
  }, []);

  return (
    <motion.button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? 'Turn ambient audio off' : 'Turn ambient audio on'}
      // Hidden means gone, not merely transparent: no phantom tab stop and
      // nothing for a screen reader to announce over a corner it cannot see.
      aria-hidden={!visible}
      tabIndex={visible ? undefined : -1}
      initial={false}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 12 }}
      transition={{ duration: reduced ? 0.15 : 0.7, ease: EASE.outExpo }}
      className={cn(
        // `left` tracks the `gutter` scale, so the pill sits on the same
        // optical column as the page's text rather than near it.
        'glass fixed bottom-5 left-5 z-[110] flex items-center gap-2.5 rounded-full',
        'px-3.5 py-2 sm:bottom-8 sm:left-10 xl:left-16',
        'transition-[color,border-color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
        on ? 'text-blue-soft' : 'text-text-3 hover:text-text-1',
        armed && 'border-white/14',
        // Framer owns opacity from hydration on; the class only has to cover
        // the server-rendered frame, where the hero still owns this corner.
        !visible && 'pointer-events-none opacity-0',
      )}
    >
      <span className="flex h-3.5 items-end gap-[3px]" aria-hidden>
        {BARS.map((bar, i) => (
          <motion.span
            key={i}
            className="h-full w-[2px] origin-bottom rounded-full bg-current"
            animate={
              on && !reduced
                ? { scaleY: bar.frames }
                : { scaleY: on ? 0.62 : 0.12 }
            }
            transition={
              on && !reduced
                ? {
                    duration: bar.duration,
                    repeat: Infinity,
                    repeatType: 'mirror',
                    ease: 'easeInOut',
                  }
                : { duration: 0.45, ease: EASE.outExpo }
            }
          />
        ))}
      </span>

      <span className="label text-current">Ambience</span>
    </motion.button>
  );
}

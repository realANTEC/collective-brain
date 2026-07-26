/**
 * UI primitive barrel.
 *
 * Every section imports from here rather than reaching into individual files,
 * so the design vocabulary has exactly one public surface.
 */

export { Reveal, StaggerGroup, StaggerItem, TextReveal } from './reveal';
export {
  SectionShell,
  InstrumentLabel,
  Headline,
  StackedHeadline,
  Lead,
  Rule,
} from './section';
export { Button } from './button';
export { GlassCard, GlassPanel } from './glass-card';
export {
  ConfidenceMeter,
  ConfidenceDial,
  Stat,
  StatusPill,
  PulseDot,
  type StatusTone,
} from './meters';
export { Marquee } from './marquee';

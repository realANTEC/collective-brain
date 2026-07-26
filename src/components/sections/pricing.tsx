'use client';

import { useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { Check } from 'lucide-react';

import {
  Button,
  GlassCard,
  InstrumentLabel,
  Reveal,
  SectionShell,
  StackedHeadline,
  StaggerGroup,
  StaggerItem,
} from '@/components/ui';
import { scrollTo } from '@/components/providers/smooth-scroll';
import { PRICING } from '@/lib/content';
import { EASE, SPRING_SNAP, fadeIn, riseIn } from '@/lib/motion';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { cn, formatFull } from '@/lib/utils';

type Tier = (typeof PRICING.tiers)[number];

const CADENCES = [
  { label: 'Monthly', annual: false },
  { label: 'Annual', annual: true },
] as const;

/** Annual billing charges ten months across twelve, so the headline rate falls. */
const monthlyEquivalent = (price: number) => Math.round((price * 10) / 12);

/**
 * Digits enter from the direction the value is travelling: annual makes the
 * number smaller, so it drops in from above and the old figure falls away
 * beneath it. AnimatePresence carries `custom` to the exiting child, which is
 * the only way the outgoing digit can know the direction chosen after it was
 * rendered.
 */
const digitSlide: Variants = {
  enter: (dir: number) => ({ y: `${dir * 105}%`, opacity: 0 }),
  center: { y: '0%', opacity: 1 },
  exit: (dir: number) => ({ y: `${dir * -105}%`, opacity: 0 }),
};

/**
 * An offset has to be baked into the variant, never passed as `<Reveal delay>`.
 * Framer Motion resolves the variant's own `transition` and discards the
 * component-level one unless the variant opts in with `inherit: true`, so a
 * delay layered on top of `fadeIn` is silently inert.
 */
const fadeAfter = (delay: number): Variants => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 1.1, ease: EASE.outExpo, delay },
  },
});

/**
 * Pricing.
 *
 * Not a pricing table. The section is a ruled sheet with one lit surface on it:
 * Open and Institution are bare columns of type divided by hairlines, and
 * Contributor is the only card in the section — which is the entire reason it
 * reads as the choice. Nothing else is needed to say so, which is why there is
 * no lit ring here; a permanent aurora would spend the site's one "this is
 * live" signal on a static price.
 *
 * The header hangs off the 12-column grid like every other section — headline
 * left, cadence control far right — so the page does not close on two
 * consecutive dead-centred stacks. The CTA below is the centred block.
 */
export function PricingSection() {
  const [annual, setAnnual] = useState(false);

  return (
    <SectionShell id="pricing" index={7}>
      <div className="gutter">
        <div className="grid grid-cols-12 items-end gap-y-10">
          <div className="col-span-12 lg:col-span-6 lg:col-start-1">
            <InstrumentLabel index="08">{PRICING.eyebrow}</InstrumentLabel>

            <StackedHeadline
              text={PRICING.headline}
              accent={PRICING.headlineAccent}
              size="h2"
              className="mt-8"
            />

            <Reveal className="mt-7" variants={riseIn}>
              <p className="measure text-lead text-text-2">{PRICING.body}</p>
            </Reveal>
          </div>

          {/* Hung far right and baseline-matched to the lead, so the control
              reads as an instrument on the same rail as the copy. */}
          <div className="col-span-12 lg:col-span-3 lg:col-start-10 lg:justify-self-end">
            <Reveal variants={fadeAfter(0.1)}>
              <CadenceToggle annual={annual} onChange={setAnnual} />
            </Reveal>
          </div>
        </div>

        <StaggerGroup
          as="ul"
          gap={0.09}
          className="mt-16 grid grid-cols-12 gap-y-12 lg:mt-24 lg:gap-x-10 lg:gap-y-0"
        >
          {PRICING.tiers.map((tier, i) =>
            tier.featured ? (
              <FeaturedTier
                key={tier.id}
                tier={tier}
                index={i}
                annual={annual}
              />
            ) : (
              <PlainTier
                key={tier.id}
                tier={tier}
                index={i}
                annual={annual}
                rule={i === 0 ? 'right' : 'left'}
              />
            ),
          )}
        </StaggerGroup>

        <Reveal className="mt-16 lg:mt-20" variants={fadeIn}>
          <p className="measure text-xs text-text-3">{PRICING.note}</p>
        </Reveal>
      </div>
    </SectionShell>
  );
}

/* -- Cadence -------------------------------------------------------------- */

function CadenceToggle({
  annual,
  onChange,
}: {
  annual: boolean;
  onChange: (value: boolean) => void;
}) {
  const reduced = usePrefersReducedMotion();

  return (
    <div
      className="glass inline-flex items-center rounded-full p-1"
      role="group"
      aria-label="Billing cadence"
    >
      {CADENCES.map((cadence) => {
        const active = cadence.annual === annual;

        return (
          <button
            key={cadence.label}
            type="button"
            onClick={() => onChange(cadence.annual)}
            aria-pressed={active}
            className={cn(
              'relative h-9 rounded-full px-5 font-mono text-[0.6875rem] tracking-[0.16em] uppercase',
              'transition-colors duration-300',
              active ? 'text-text-1' : 'text-text-3 hover:text-text-2',
            )}
          >
            {active && (
              <motion.span
                aria-hidden
                layoutId="cadence-indicator"
                className="absolute inset-0 rounded-full border border-white/14 bg-white/10"
                transition={reduced ? { duration: 0 } : SPRING_SNAP}
              />
            )}
            <span className="relative">{cadence.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* -- Shared tier parts ---------------------------------------------------- */

/** Mono index, hairline, name — identical across all three so the row still
 *  scans as one comparison even though the surfaces differ. */
function TierHeading({ index, name }: { index: number; name: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="label tnum text-blue-soft/70">
        {String(index + 1).padStart(2, '0')}
      </span>
      <span aria-hidden className="h-px w-5 bg-line-strong" />
      <h3 className="label text-text-1">{name}</h3>
    </div>
  );
}

function TierPrice({ tier, annual }: { tier: Tier; annual: boolean }) {
  const reduced = usePrefersReducedMotion();

  const amount =
    tier.price === null
      ? null
      : annual
        ? monthlyEquivalent(tier.price)
        : tier.price;

  const dir = annual ? -1 : 1;

  const subline =
    tier.price === null
      ? null
      : annual && tier.price > 0
        ? `${tier.cadence} · $${formatFull(tier.price * 10)} billed yearly`
        : tier.cadence;

  return (
    <div className="mt-7">
      {amount === null ? (
        <span className="text-h2 block font-sans font-medium text-lume leading-[1.25]">
          Custom
        </span>
      ) : (
        <span className="grid overflow-hidden">
          <AnimatePresence initial={false} custom={dir}>
            <motion.span
              key={amount}
              custom={dir}
              variants={digitSlide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: 0.5, ease: EASE.outExpo }
              }
              className="text-h2 tnum col-start-1 row-start-1 block font-sans font-medium leading-[1.25]"
            >
              <span className="text-text-3">$</span>
              <span className="text-lume">{amount}</span>
            </motion.span>
          </AnimatePresence>
        </span>
      )}

      {/* Reserved so flipping cadence never shifts what sits below it. */}
      <span className="mt-2 block h-5 font-mono text-[0.6875rem] text-text-3">
        {subline}
      </span>
    </div>
  );
}

/* -- Tiers ---------------------------------------------------------------- */

/**
 * An un-carded tier: a column of type on the void, ruled like a spec sheet and
 * separated from the featured card by a single vertical hairline. No glass, no
 * radius, no blue ticks — the marker is a hanging mono `+` so the only blue in
 * the column is its index.
 */
function PlainTier({
  tier,
  index,
  annual,
  rule,
}: {
  tier: Tier;
  index: number;
  annual: boolean;
  /** Which edge carries the divider — the one facing the featured card. */
  rule: 'left' | 'right';
}) {
  return (
    <StaggerItem
      as="li"
      variants={riseIn}
      className={cn(
        'relative col-span-12 flex flex-col border-t border-line pt-10',
        // Stacked, the hairline runs across the top; in the row it stands up
        // and moves to the edge, and the top padding aligns the three names.
        'lg:col-span-4 lg:border-t-0 lg:pt-14',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'rule-v absolute inset-y-0 hidden lg:block',
          // Half the 2.5rem column gap, so it sits dead centre of the channel.
          rule === 'right' ? '-right-5' : '-left-5',
        )}
      />

      <TierHeading index={index} name={tier.name} />
      <TierPrice tier={tier} annual={annual} />

      <p className="mt-6 max-w-[38ch] text-sm text-text-3">{tier.summary}</p>

      <ul className="mt-8 border-t border-line">
        {tier.features.map((feature) => (
          <li
            key={feature}
            className="grid grid-cols-[1.15rem_1fr] items-baseline gap-x-2 border-b border-line py-3.5"
          >
            <span aria-hidden className="font-mono text-xs text-text-3">
              +
            </span>
            <span className="text-sm text-text-2">{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-9">
        {tier.id === 'institution' ? (
          <Button variant="secondary" onClick={() => scrollTo('#cta')}>
            {tier.cta}
          </Button>
        ) : (
          <Button variant="secondary" href="/answer">
            {tier.cta}
          </Button>
        )}
      </div>
    </StaggerItem>
  );
}

/**
 * The one surface in the section. Deep glass, a single soft radial glow and the
 * badge — that is the whole emphasis budget, and it is spent once.
 */
function FeaturedTier({
  tier,
  index,
  annual,
}: {
  tier: Tier;
  index: number;
  annual: boolean;
}) {
  const badge = 'badge' in tier ? tier.badge : null;

  return (
    <StaggerItem
      as="li"
      variants={riseIn}
      className="col-span-12 flex lg:col-span-4"
    >
      <div
        // The glow and the badge live on this wrapper rather than inside the
        // card so they travel together on the hover lift.
        className={cn(
          'relative isolate flex w-full rounded-lg',
          'transition-transform duration-700 ease-out-expo hover:-translate-y-1.5',
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-x-10 -inset-y-14 -z-10 blur-3xl"
          style={{
            background:
              'radial-gradient(56% 46% at 50% 42%, color-mix(in oklab, var(--color-blue) 22%, transparent), color-mix(in oklab, var(--color-violet) 10%, transparent) 48%, transparent 74%)',
          }}
        />

        <GlassCard
          tilt={0}
          deep
          glowOnHover={false}
          className="w-full"
          innerClassName="flex flex-col px-7 pt-12 pb-9 hover:border-white/16 sm:px-9 sm:pt-14 sm:pb-10"
        >
          <TierHeading index={index} name={tier.name} />
          <TierPrice tier={tier} annual={annual} />

          <p className="mt-6 text-sm text-text-2">{tier.summary}</p>

          <span aria-hidden className="rule mt-8" />

          <ul className="mt-6 space-y-2.5">
            {tier.features.map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-2.5 text-sm text-text-2"
              >
                <Check
                  aria-hidden
                  strokeWidth={2}
                  className="mt-[0.26rem] size-3.5 shrink-0 text-blue-soft"
                />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-9">
            <Button variant="primary" href="/answer">
              {tier.cta}
            </Button>
          </div>
        </GlassCard>

        {badge && (
          <span className="absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-soft/30 bg-surface-2 px-3 py-1.5 font-mono text-[0.625rem] tracking-[0.16em] whitespace-nowrap text-blue-soft uppercase">
            {badge}
          </span>
        )}
      </div>
    </StaggerItem>
  );
}

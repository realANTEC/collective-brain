'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowUpRight, TriangleAlert } from 'lucide-react';

import {
  askCollectiveBrain,
  AnswerServiceError,
  type LiveAnswer,
} from '@/lib/answer-service';
import { Atmosphere } from '@/components/overlays/atmosphere';
import { ConfidenceDial, InstrumentLabel, PulseDot, Reveal, StaggerGroup, StaggerItem } from '@/components/ui';
import { EASE, riseInFlat } from '@/lib/motion';
import { cn, formatFull } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/lib/hooks';

/**
 * The live answer surface.
 *
 * Kept visually separate from the curated eight-layer page on purpose. That
 * page is a designed artefact with evidence, dissent and a confidence history
 * no 3B model can produce; presenting model prose inside the same chrome would
 * quietly borrow its authority. This view shows exactly what the service
 * actually returned — the prose, the passages it retrieved, and its own
 * statement of how the confidence number was computed — and nothing else.
 */

/** Honest stage copy. Each line names a step the pipeline genuinely performs. */
const STAGES = [
  { at: 0, label: 'Embedding the question', detail: 'bge-small-en-v1.5' },
  { at: 900, label: 'Searching the corpus', detail: '47,725 passages' },
  { at: 2200, label: 'Reading the top matches', detail: 'cosine ranked' },
  { at: 4000, label: 'Composing the answer', detail: 'Qwen2.5-3B-Instruct' },
  // The service scales to zero, so a first request after idle really is waiting
  // on weights returning to the GPU. Say so rather than looping a spinner.
  { at: 9000, label: 'Waking the model', detail: 'cold start, up to a minute' },
] as const;

export function LiveAnswerView({ query }: { query: string }) {
  const reduced = usePrefersReducedMotion();
  const [answer, setAnswer] = useState<LiveAnswer | null>(null);
  const [error, setError] = useState<AnswerServiceError | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    startedAt.current = performance.now();
    setAnswer(null);
    setError(null);

    askCollectiveBrain(query, { signal: controller.signal })
      .then(setAnswer)
      .catch((e: AnswerServiceError) => {
        if (e.kind !== 'network' || !controller.signal.aborted) setError(e);
      });

    return () => controller.abort();
  }, [query]);

  useEffect(() => {
    if (answer || error) return;
    const id = setInterval(
      () => setElapsed(performance.now() - startedAt.current),
      250,
    );
    return () => clearInterval(id);
  }, [answer, error]);

  const stage = [...STAGES].reverse().find((s) => elapsed >= s.at) ?? STAGES[0];

  return (
    <>
      {/* The WebGL core is not mounted on this route, so the page supplies its
          own depth — same as the curated answer view. */}
      <Atmosphere />
      <main id="main" className="relative z-10 min-h-[100svh]">
      <div className="gutter mx-auto max-w-3xl pt-28 pb-32 sm:pt-32">
        <Link
          href="/"
          className="group inline-flex items-center gap-2 text-text-3 transition-colors hover:text-text-1"
        >
          <ArrowLeft
            className="size-3.5 transition-transform duration-500 ease-out-expo group-hover:-translate-x-1"
            strokeWidth={1.75}
          />
          <span className="label">Back to the Core</span>
        </Link>

        <div className="mt-9 flex items-center gap-3">
          <PulseDot />
          <span className="label text-cyan">Live answer</span>
        </div>

        <h1 className="mt-5 text-h2 font-sans font-medium text-lume">{query}</h1>

        <AnimatePresence mode="wait">
          {/* ── Working ─────────────────────────────────────────────────── */}
          {!answer && !error && (
            <motion.div
              key="loading"
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <ul className="space-y-3">
                {STAGES.filter((s) => elapsed >= s.at).map((s) => (
                  <li key={s.label} className="flex items-center gap-3">
                    <span
                      className={cn(
                        'size-1.5 shrink-0 rounded-full transition-colors duration-500',
                        s === stage
                          ? 'bg-blue-soft shadow-[0_0_10px_rgba(110,144,255,0.9)]'
                          : 'bg-cyan',
                      )}
                      aria-hidden
                    />
                    <span className="flex-1 text-sm text-text-1">{s.label}</span>
                    <span className="font-mono text-[0.625rem] text-text-3">
                      {s.detail}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-6 h-px w-full overflow-hidden bg-white/8">
                <motion.div
                  className="h-full w-1/3 bg-gradient-to-r from-transparent via-blue-soft to-transparent"
                  animate={reduced ? undefined : { x: ['-100%', '300%'] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>

              <p className="mt-4 font-mono text-[0.625rem] text-text-4">
                {(elapsed / 1000).toFixed(1)}s elapsed
              </p>
            </motion.div>
          )}

          {/* ── Failed ──────────────────────────────────────────────────── */}
          {error && (
            <motion.div
              key="error"
              className="mt-12 rounded-lg border border-amber/25 bg-amber/6 p-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE.outExpo }}
            >
              <div className="flex items-center gap-2.5">
                <TriangleAlert className="size-4 text-amber" strokeWidth={1.75} />
                <span className="label text-amber">Answer unavailable</span>
              </div>
              <p className="measure mt-4 text-sm text-text-2">
                {error.kind === 'timeout'
                  ? 'The model did not wake in time. It scales to zero between questions, so the first request after a quiet period can exceed the timeout — asking again usually lands on a warm container.'
                  : error.kind === 'unconfigured'
                    ? 'No answer endpoint is configured for this build, so there is nothing to ask.'
                    : `The service could not be reached (${error.kind}).`}
              </p>
              <Link
                href="/answer"
                className="mt-5 inline-flex items-center gap-2 text-sm text-blue-soft transition-colors hover:text-cyan"
              >
                Read the curated sample answer instead
                <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
              </Link>
            </motion.div>
          )}

          {/* ── Answered ────────────────────────────────────────────────── */}
          {answer && (
            <motion.div
              key="answer"
              initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.7, ease: EASE.outExpo }}
            >
              <div className="mt-8 flex flex-col-reverse items-start gap-8 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-mono text-[0.625rem] tracking-[0.14em] text-text-3 uppercase">
                  {answer.model.split('/').pop()} · {formatFull(answer.documents)}{' '}
                  passages · {(answer.latencyMs / 1000).toFixed(1)}s
                </p>
                <ConfidenceDial value={Math.round(answer.confidence * 100)} size={104} />
              </div>

              <div className="rule mt-8" />

              <section className="mt-10">
                <InstrumentLabel index="01">Answer</InstrumentLabel>
                <p className="mt-6 text-lead text-text-1">{answer.answer}</p>
              </section>

              <section className="mt-14">
                <InstrumentLabel index="02">
                  Retrieved sources · {answer.sources.length}
                </InstrumentLabel>

                <StaggerGroup as="ul" gap={0.07} className="mt-6 border-t border-line">
                  {answer.sources.map((s) => (
                    <StaggerItem
                      as="li"
                      key={`${s.corpusIndex}-${s.title}`}
                      variants={riseInFlat}
                      className="border-b border-line"
                    >
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block py-5 transition-colors hover:bg-white/2"
                      >
                        <div className="flex items-baseline justify-between gap-4">
                          <h3 className="text-sm font-medium text-text-1 transition-colors group-hover:text-blue-soft">
                            {s.title}
                          </h3>
                          <span className="tnum shrink-0 font-mono text-[0.625rem] text-text-3">
                            {s.score.toFixed(3)}
                          </span>
                        </div>
                        <p className="measure mt-2 text-xs text-text-3">
                          {s.snippet.slice(0, 190)}
                          {s.snippet.length > 190 ? '…' : ''}
                        </p>
                      </a>
                    </StaggerItem>
                  ))}
                </StaggerGroup>
              </section>

              {/* The service's own disclosure, rendered verbatim. */}
              <Reveal className="mt-14">
                <div className="rounded-lg border border-line bg-surface-2/60 p-6">
                  <span className="label">How to read this</span>
                  <p className="measure mt-3 text-xs leading-relaxed text-text-2">
                    {answer.notice}
                  </p>
                  {answer.confidenceBasis && (
                    <p className="mt-4 font-mono text-[0.625rem] leading-relaxed text-text-4">
                      Confidence = {answer.confidenceBasis}
                    </p>
                  )}
                  <Link
                    href="/answer"
                    className="mt-5 inline-flex items-center gap-2 text-xs text-blue-soft transition-colors hover:text-cyan"
                  >
                    See what a fully-formed answer looks like
                    <ArrowUpRight className="size-3" strokeWidth={1.75} />
                  </Link>
                </div>
              </Reveal>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </main>
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { loadSemanticCore, type SemanticNode } from '@/components/three/semantic-core';
import { EASE } from '@/lib/motion';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { PulseDot } from '@/components/ui';
import { formatFull } from '@/lib/utils';

/**
 * Proof, in the UI, that the object behind this section is real.
 *
 * The core's node positions come from an actual embedding, and every concept
 * node carries the title of the article at the centre of its cluster. Showing
 * those titles is what turns "the graph has a shape" from a claim in the copy
 * into something the reader can check — the labels cycling here are the same
 * clusters being rendered a few hundred pixels away.
 *
 * Renders nothing at all if the embedding did not load, since the scene will
 * have fallen back to procedural geometry and there would be nothing true to
 * report.
 */
export function SemanticReadout() {
  const reduced = usePrefersReducedMotion();
  const [nodes, setNodes] = useState<SemanticNode[] | null>(null);
  // Counted across every cluster, not just the ones on display. Summing the
  // visible subset would understate the corpus by two thirds and put a wrong
  // number in front of the reader.
  const [corpusSize, setCorpusSize] = useState(0);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    let alive = true;
    loadSemanticCore().then((data) => {
      if (!alive || !data) return;
      setCorpusSize(data.nodes.reduce((sum, n) => sum + n.size, 0));
      // Largest clusters read as recognisable fields; the long tail is mostly
      // single-topic stubs and makes the readout look arbitrary.
      setNodes([...data.nodes].sort((a, b) => b.size - a.size).slice(0, 24));
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!nodes || reduced) return;
    const id = setInterval(() => setCursor((c) => c + 1), 2600);
    return () => clearInterval(id);
  }, [nodes, reduced]);

  if (!nodes || nodes.length < 3) return null;

  const shown = [0, 1, 2].map((i) => nodes[(cursor * 3 + i) % nodes.length]);

  return (
    <div className="mt-10 border-t border-line pt-6">
      <div className="flex items-center gap-2.5">
        <PulseDot />
        <span className="label">Sampling the core</span>
      </div>

      <ul className="mt-4 space-y-2.5">
        {shown.map((node, i) => (
          <li key={`${cursor}-${i}`} className="flex items-baseline gap-3">
            <span className="label tnum shrink-0 text-blue-soft/70">
              {String(((cursor * 3 + i) % nodes.length) + 1).padStart(2, '0')}
            </span>
            <AnimatePresence mode="wait">
              <motion.span
                key={node.label}
                className="min-w-0 flex-1 truncate text-sm text-text-1"
                initial={reduced ? false : { opacity: 0, y: 6, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                transition={{ duration: 0.45, ease: EASE.outExpo, delay: i * 0.05 }}
              >
                {node.label}
              </motion.span>
            </AnimatePresence>
            <span className="tnum shrink-0 font-mono text-[0.625rem] text-text-3">
              {formatFull(node.size)}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-[0.6875rem] leading-relaxed text-text-3">
        Not decoration. Every point behind this section is one of{' '}
        <span className="tnum text-text-2">{formatFull(corpusSize)}</span> encyclopedia
        articles, embedded and projected onto the sphere — neighbours on screen
        are neighbours in meaning.
      </p>
    </div>
  );
}

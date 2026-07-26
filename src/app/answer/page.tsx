import type { Metadata } from 'next';

import { AnswerView } from '@/components/answer/answer-view';
import { ANSWER } from '@/lib/content';

/**
 * Search results truncate around 160 characters. Cutting on a sentence
 * boundary rather than a character count means the description never ends
 * mid-clause — which is what a hard slice of this particular summary does.
 */
function metaDescription(text: string, max = 160) {
  const sentences = text.split(/(?<=\.)\s+/);
  let out = '';
  for (const sentence of sentences) {
    if (out && `${out} ${sentence}`.length > max) break;
    out = out ? `${out} ${sentence}` : sentence;
  }
  return out.length <= max ? out : `${out.slice(0, max - 1).trimEnd()}…`;
}

const DESCRIPTION = metaDescription(ANSWER.summary);

export const metadata: Metadata = {
  title: ANSWER.query,
  description: DESCRIPTION,
  openGraph: {
    title: `${ANSWER.query} — Collective Brain`,
    description: DESCRIPTION,
  },
  twitter: {
    title: `${ANSWER.query} — Collective Brain`,
    description: DESCRIPTION,
  },
};

export default function AnswerPage() {
  return <AnswerView />;
}

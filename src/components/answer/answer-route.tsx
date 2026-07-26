'use client';

import { useSearchParams } from 'next/navigation';

import { AnswerView } from './answer-view';
import { LiveAnswerView } from './live-answer';
import { isAnswerServiceConfigured } from '@/lib/answer-service';

/**
 * Chooses between the curated answer and a live one.
 *
 * The query is read on the client rather than from server searchParams so the
 * route stays statically prerendered — reading them on the server would opt
 * the whole page into dynamic rendering for a parameter that is absent on
 * every visit except a search.
 *
 * `/answer`            the designed eight-layer sample, always available
 * `/answer?q=...`      whatever the live service actually returned
 *
 * With no endpoint configured the query is ignored and the curated page is
 * shown, so a build without the env var behaves exactly as it did before the
 * service existed.
 */
export function AnswerRoute() {
  const params = useSearchParams();
  const query = params.get('q')?.trim();

  if (query && isAnswerServiceConfigured()) {
    return <LiveAnswerView query={query} />;
  }

  return <AnswerView />;
}

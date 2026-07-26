/* ==========================================================================
   LIVE ANSWER SERVICE
   --------------------------------------------------------------------------
   Client for the Modal endpoint built by pipeline/answer_service.py.

   Deliberately OFF by default. The endpoint is a scale-to-zero GPU service
   billed to whoever deployed it, and this repository is public — baking a URL
   in would let anyone reading the source spend someone else's money, and every
   visitor to a deployed copy would wake a GPU. Set the env var to opt in:

       NEXT_PUBLIC_ANSWER_ENDPOINT=https://<your-app>.modal.run

   With nothing configured the search behaves exactly as it did before this
   existed: the curated, clearly-illustrative answer page.
   ========================================================================== */

export interface AnswerSource {
  title: string;
  snippet: string;
  score: number;
  url: string;
  corpusIndex: number;
}

export interface LiveAnswer {
  question: string;
  answer: string;
  /** 0–1. A heuristic; the service publishes its own formula in confidenceBasis. */
  confidence: number;
  grounded: boolean;
  sources: AnswerSource[];
  confidenceBasis: string;
  model: string;
  retriever: string;
  corpus: string;
  documents: number;
  latencyMs: number;
  notice: string;
}

const ENDPOINT = (process.env.NEXT_PUBLIC_ANSWER_ENDPOINT ?? '').replace(/\/+$/, '');

/** True when an endpoint has been configured. Read this before offering live UI. */
export const isAnswerServiceConfigured = () => ENDPOINT.length > 0;

/**
 * Nudge the container awake.
 *
 * The service scales to zero, so the first question after an idle period pays a
 * cold start — model weights back onto the GPU, tens of seconds. Firing a
 * health check the moment someone focuses the field usually overlaps that with
 * them typing, which is the difference between "instant" and "did it break".
 *
 * Fire-and-forget by design: nothing depends on the result.
 */
export function warmAnswerService(): void {
  if (!ENDPOINT) return;
  void fetch(`${ENDPOINT}/health`, { method: 'GET', mode: 'cors' }).catch(() => {});
}

export class AnswerServiceError extends Error {
  constructor(
    message: string,
    readonly kind: 'unconfigured' | 'timeout' | 'network' | 'server' | 'malformed',
  ) {
    super(message);
    this.name = 'AnswerServiceError';
  }
}

/**
 * Ask a question. Rejects with an AnswerServiceError the caller can branch on
 * rather than a bare Error, because a cold-start timeout and a 500 want
 * different words in front of the reader.
 */
export async function askCollectiveBrain(
  question: string,
  { signal, timeoutMs = 120_000, k = 6 }: {
    signal?: AbortSignal;
    timeoutMs?: number;
    k?: number;
  } = {},
): Promise<LiveAnswer> {
  if (!ENDPOINT) {
    throw new AnswerServiceError('No answer endpoint configured', 'unconfigured');
  }

  // A cold start can run past a minute, so the ceiling is generous — but it has
  // to exist, or a container that never wakes leaves the UI spinning forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetch(`${ENDPOINT}/ask`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, k }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new AnswerServiceError(
        `Answer service returned ${res.status}`,
        'server',
      );
    }

    const data = (await res.json()) as Partial<LiveAnswer>;
    if (typeof data.answer !== 'string' || !Array.isArray(data.sources)) {
      throw new AnswerServiceError('Unexpected response shape', 'malformed');
    }

    return {
      question: data.question ?? question,
      answer: data.answer,
      confidence: typeof data.confidence === 'number' ? data.confidence : 0,
      grounded: Boolean(data.grounded),
      sources: data.sources,
      confidenceBasis: data.confidenceBasis ?? '',
      model: data.model ?? 'unknown',
      retriever: data.retriever ?? 'unknown',
      corpus: data.corpus ?? 'unknown',
      documents: data.documents ?? 0,
      latencyMs: data.latencyMs ?? 0,
      notice: data.notice ?? '',
    };
  } catch (err) {
    if (err instanceof AnswerServiceError) throw err;
    if ((err as Error).name === 'AbortError') {
      // Distinguish "the user navigated away" from "the model never woke".
      if (signal?.aborted) throw new AnswerServiceError('Cancelled', 'network');
      throw new AnswerServiceError(
        'The model did not respond in time',
        'timeout',
      );
    }
    throw new AnswerServiceError((err as Error).message, 'network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

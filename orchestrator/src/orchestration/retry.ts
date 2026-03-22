export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  /** Called after a failed attempt when another retry will be attempted (not called on final failure). */
  onRetryScheduled?: (info: {
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    error: unknown;
  }) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let last: unknown;
  const maxAttempts = opts.retries + 1;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (attempt === opts.retries) break;
      const delay = opts.baseDelayMs * 2 ** attempt;
      opts.onRetryScheduled?.({
        attempt: attempt + 1,
        maxAttempts,
        delayMs: delay,
        error: e,
      });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

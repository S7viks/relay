import { describe, expect, it, vi } from "vitest";
import { withRetry } from "./retry.js";

describe("withRetry", () => {
  it("calls onRetryScheduled when scheduling a retry", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 2) throw new Error("transient");
      return 42;
    });
    const onRetryScheduled = vi.fn();
    const out = await withRetry(fn, { retries: 2, baseDelayMs: 1, onRetryScheduled });
    expect(out).toBe(42);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetryScheduled).toHaveBeenCalledTimes(1);
    expect(onRetryScheduled.mock.calls[0]?.[0]).toMatchObject({
      attempt: 1,
      maxAttempts: 3,
      delayMs: 1,
    });
  });
});

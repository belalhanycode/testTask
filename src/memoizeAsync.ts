// A robust async memoizer with proper typing and concurrency handling
export type AsyncFn<TArgs extends readonly unknown[], TReturn> = (
  ...args: TArgs
) => Promise<TReturn>;

export interface MemoizedAsyncFn<TArgs extends readonly unknown[], TReturn>
  extends AsyncFn<TArgs, TReturn> {
  clear(): void;
}

export function memoizeAsync<TArgs extends readonly unknown[], TReturn>(
  fn: AsyncFn<TArgs, TReturn>,
  ttlMs = 5000
): MemoizedAsyncFn<TArgs, TReturn> {
  const cache = new Map<
    string,
    { promise: Promise<TReturn>; expires: number }
  >();

  const memoized = (...args: TArgs): Promise<TReturn> => {
    const key = JSON.stringify(args);
    const now = Date.now();

    // Check if we have a valid cached entry
    if (cache.has(key)) {
      const entry = cache.get(key)!;
      if (entry.expires > now) {
        return entry.promise;
      }
      // Entry is expired, remove it
      cache.delete(key);
    }

    // Create new promise and cache it immediately to handle concurrency
    const promise = fn(...args).catch((error) => {
      // Remove failed promise from cache
      cache.delete(key);
      throw error;
    });

    cache.set(key, {
      promise,
      expires: now + ttlMs,
    });

    return promise;
  };

  // Add clear method
  memoized.clear = () => {
    cache.clear();
  };

  return memoized;
}

// Example usage with proper typing
const example = memoizeAsync(async (x: number, y: string) => {
  return `${x}-${y}`;
}, 1000);

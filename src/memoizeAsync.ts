// A naïve async memoizer with multiple subtle bugs & weak typing.
export type AsyncFn<T> = (...args: any[]) => Promise<T>;

export function memoizeAsync<T>(
  fn: AsyncFn<T>,
  ttlMs = 5_000
): AsyncFn<T> {
  const cache = new Map<
    string,
    { value: T; expires: number }
  >();

  return async (...args: any[]): Promise<T> => {
    const key = JSON.stringify(args);
    const now = Date.now();

    if (cache.has(key)) {
      const entry = cache.get(key)!;
      if (entry.expires < now) cache.delete(key);
      else return entry.value;               // ← loses the Promise!
    }

    const value = await fn(...args);          // ← duplicates concurrent calls
    cache.set(key, { value, expires: now + ttlMs });
    return value;
  };
}

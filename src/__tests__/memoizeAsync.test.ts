import { memoizeAsync } from "../memoizeAsync";

describe("memoizeAsync", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("concurrency deduplication", () => {
    it("should deduplicate concurrent calls with identical arguments", async () => {
      const mockFn = jest.fn().mockImplementation(async (x: number) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return x * 2;
      });

      const memoized = memoizeAsync(mockFn, 5000);

      // Start multiple concurrent calls with same arguments
      const promise1 = memoized(5);
      const promise2 = memoized(5);
      const promise3 = memoized(5);

      // All should reference the same promise
      expect(promise1).toBe(promise2);
      expect(promise2).toBe(promise3);

      // Advance timers to resolve the promises
      jest.advanceTimersByTime(100);

      const [result1, result2, result3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ]);

      // All results should be the same
      expect(result1).toBe(10);
      expect(result2).toBe(10);
      expect(result3).toBe(10);

      // Original function should be called only once
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith(5);
    });

    it("should not deduplicate calls with different arguments", async () => {
      const mockFn = jest.fn().mockImplementation(async (x: number) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return x * 2;
      });

      const memoized = memoizeAsync(mockFn, 5000);

      // Start concurrent calls with different arguments
      const promise1 = memoized(5);
      const promise2 = memoized(10);

      // Should be different promises
      expect(promise1).not.toBe(promise2);

      jest.advanceTimersByTime(100);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe(10);
      expect(result2).toBe(20);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe("TTL expiry", () => {
    it("should cache results within TTL period", async () => {
      const mockFn = jest.fn().mockImplementation(async (x: number) => {
        return x * 2;
      });

      const memoized = memoizeAsync(mockFn, 1000);

      // First call
      const result1 = await memoized(5);
      expect(result1).toBe(10);
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Second call within TTL - should use cache
      const result2 = await memoized(5);
      expect(result2).toBe(10);
      expect(mockFn).toHaveBeenCalledTimes(1); // Still only called once
    });

    it("should expire cache after TTL and make fresh calls", async () => {
      const mockFn = jest.fn().mockImplementation(async (x: number) => {
        return x * 2;
      });

      const memoized = memoizeAsync(mockFn, 1000);

      // First call
      const result1 = await memoized(5);
      expect(result1).toBe(10);
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Advance time past TTL
      jest.advanceTimersByTime(1001);

      // Second call after TTL - should make fresh call
      const result2 = await memoized(5);
      expect(result2).toBe(10);
      expect(mockFn).toHaveBeenCalledTimes(2); // Called twice now
    });

    it("should not return stale entries", async () => {
      const mockFn = jest
        .fn()
        .mockImplementationOnce(async () => "first")
        .mockImplementationOnce(async () => "second");

      const memoized = memoizeAsync(mockFn, 1000);

      // First call
      const result1 = await memoized();
      expect(result1).toBe("first");

      // Advance time past TTL
      jest.advanceTimersByTime(1001);

      // Second call should get fresh result
      const result2 = await memoized();
      expect(result2).toBe("second");
    });
  });

  describe("error handling and cache cleanup", () => {
    it("should propagate errors and not cache failed promises", async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new Error("First error"))
        .mockResolvedValueOnce("Success");

      const memoized = memoizeAsync(mockFn, 5000);

      // First call should throw
      await expect(memoized(5)).rejects.toThrow("First error");
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Second call should not use cached error and should succeed
      const result = await memoized(5);
      expect(result).toBe("Success");
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it("should remove failed promise from cache immediately", async () => {
      let callCount = 0;
      const mockFn = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Failure");
        }
        return "Success";
      });

      const memoized = memoizeAsync(mockFn, 5000);

      // First call fails
      await expect(memoized(5)).rejects.toThrow("Failure");

      // Immediate retry should call function again (not cached)
      const result = await memoized(5);
      expect(result).toBe("Success");
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it("should handle concurrent calls when one fails", async () => {
      const mockFn = jest.fn().mockImplementation(async (x: number) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        throw new Error("Concurrent error");
      });

      const memoized = memoizeAsync(mockFn, 5000);

      // Start concurrent calls
      const promise1 = memoized(5);
      const promise2 = memoized(5);

      // Both should reference the same promise
      expect(promise1).toBe(promise2);

      jest.advanceTimersByTime(100);

      // Both should reject with the same error
      await expect(promise1).rejects.toThrow("Concurrent error");
      await expect(promise2).rejects.toThrow("Concurrent error");

      // Function should be called only once
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("clear() method", () => {
    it("should clear the cache", async () => {
      const mockFn = jest.fn().mockImplementation(async (x: number) => {
        return x * 2;
      });

      const memoized = memoizeAsync(mockFn, 5000);

      // First call
      await memoized(5);
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await memoized(5);
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Clear cache
      memoized.clear();

      // Third call should make fresh call
      await memoized(5);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it("should clear cache for all argument combinations", async () => {
      const mockFn = jest.fn().mockImplementation(async (x: number) => {
        return x * 2;
      });

      const memoized = memoizeAsync(mockFn, 5000);

      // Cache multiple argument combinations
      await memoized(5);
      await memoized(10);
      expect(mockFn).toHaveBeenCalledTimes(2);

      // Subsequent calls should use cache
      await memoized(5);
      await memoized(10);
      expect(mockFn).toHaveBeenCalledTimes(2);

      // Clear cache
      memoized.clear();

      // All calls should be fresh
      await memoized(5);
      await memoized(10);
      expect(mockFn).toHaveBeenCalledTimes(4);
    });
  });

  describe("type safety", () => {
    it("should preserve function signature types", async () => {
      const typedFn = async (x: number, y: string): Promise<string> => {
        return `${x}-${y}`;
      };

      const memoized = memoizeAsync(typedFn, 1000);

      // TypeScript should enforce correct argument types
      const result = await memoized(42, "hello");
      expect(result).toBe("42-hello");
      expect(typeof result).toBe("string");

      // The clear method should be available
      expect(typeof memoized.clear).toBe("function");
      memoized.clear();
    });
  });

  describe("complex arguments", () => {
    it("should handle objects and arrays as arguments", async () => {
      const mockFn = jest
        .fn()
        .mockImplementation(async (obj: { a: number }, arr: number[]) => {
          return obj.a + arr.reduce((sum, x) => sum + x, 0);
        });

      const memoized = memoizeAsync(mockFn, 5000);

      const obj = { a: 10 };
      const arr = [1, 2, 3];

      // First call
      const result1 = await memoized(obj, arr);
      expect(result1).toBe(16);
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Second call with same arguments should use cache
      const result2 = await memoized(obj, arr);
      expect(result2).toBe(16);
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Call with different arguments should not use cache
      const result3 = await memoized({ a: 20 }, arr);
      expect(result3).toBe(26);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });
});

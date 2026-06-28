import { describe, expect, it } from 'vitest';
import { percentile } from './quantile.js';

describe('percentile', () => {
  it('returns 0 for an empty sample', () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  it('returns the only value for a singleton', () => {
    expect(percentile([42], 0.95)).toBe(42);
  });

  it('computes the median of an odd-length sample', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });

  it('interpolates the median of an even-length sample', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it('computes p95 over 1..100 via linear interpolation', () => {
    // rank = (100-1)*0.95 = 94.05 → 95 + 0.05*(96-95) = 95.05
    expect(
      percentile(
        Array.from({ length: 100 }, (_, i) => i + 1),
        0.95,
      ),
    ).toBeCloseTo(95.05, 5);
  });

  it('is order-independent', () => {
    expect(percentile([5, 3, 1, 4, 2], 0.5)).toBe(3);
  });

  it('clamps p<=0 to the min and p>=1 to the max', () => {
    expect(percentile([10, 20, 30], 0)).toBe(10);
    expect(percentile([10, 20, 30], 1)).toBe(30);
  });
});

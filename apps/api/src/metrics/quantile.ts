/**
 * Linear-interpolation percentile over an unsorted sample.
 *
 * `p` is a fraction in [0, 1] (e.g. 0.95 for p95). Returns 0 for an empty
 * sample. Uses the same "rank = (n-1)·p" interpolation as NumPy's default, so
 * results are predictable and easy to unit-test against known inputs.
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (p <= 0) return sorted[0]!;
  if (p >= 1) return sorted[sorted.length - 1]!;

  const rank = (sorted.length - 1) * p;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;

  const frac = rank - lo;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * frac;
}

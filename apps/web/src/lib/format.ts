/** Presentation formatters. Pure functions, unit-testable. */

/** Compact duration: sub-second in ms, otherwise seconds with two decimals. */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** USD with adaptive precision (totals coarse, per-run fine). */
export function formatUsd(usd: number, decimals = 4): string {
  return `$${usd.toFixed(decimals)}`;
}

/** Thousands-separated integer; compact "k"/"M" above 10k. */
export function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  return Math.round(value).toLocaleString('en-US');
}

export function formatPercent(fraction: number, decimals = 1): string {
  return `${(fraction * 100).toFixed(decimals)}%`;
}

/** Wall clock HH:MM:SS for an epoch-ms timestamp. */
export function formatClock(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour12: false });
}

/** Coarse "Ns ago" / "Nm ago" relative time. */
export function formatRelative(ts: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

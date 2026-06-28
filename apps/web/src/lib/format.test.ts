import { describe, expect, it } from 'vitest';
import { formatDuration, formatNumber, formatPercent, formatRelative, formatUsd } from './format';

describe('formatDuration', () => {
  it('shows dash for undefined', () => {
    expect(formatDuration(undefined)).toBe('—');
  });
  it('uses ms below a second', () => {
    expect(formatDuration(450)).toBe('450ms');
  });
  it('uses seconds at or above a second', () => {
    expect(formatDuration(1500)).toBe('1.50s');
  });
});

describe('formatNumber', () => {
  it('separates thousands below 10k', () => {
    expect(formatNumber(2500)).toBe('2,500');
  });
  it('compacts to k above 10k', () => {
    expect(formatNumber(89_950)).toBe('90.0k');
  });
  it('compacts to M above a million', () => {
    expect(formatNumber(2_400_000)).toBe('2.4M');
  });
});

describe('formatPercent / formatUsd', () => {
  it('formats a fraction as a percentage', () => {
    expect(formatPercent(0.0625)).toBe('6.3%');
  });
  it('formats USD with adaptive precision', () => {
    expect(formatUsd(0.21393, 2)).toBe('$0.21');
    expect(formatUsd(0.004, 4)).toBe('$0.0040');
  });
});

describe('formatRelative', () => {
  it('reports seconds', () => {
    expect(formatRelative(10_000, 13_000)).toBe('3s ago');
  });
  it('reports minutes', () => {
    expect(formatRelative(0, 120_000)).toBe('2m ago');
  });
});

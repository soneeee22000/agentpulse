import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { RunDetail } from '@pulse/shared';
import SpanWaterfall from './SpanWaterfall.vue';

const detail: RunDetail = {
  runId: 'r1',
  workflow: 'rag-pipeline',
  status: 'error',
  startedAt: 1000,
  durationMs: 1000,
  spanCount: 2,
  errorCount: 1,
  totalTokens: 100,
  totalCostUsd: 0.01,
  spans: [
    {
      spanId: 's1',
      name: 'Plan approach',
      kind: 'plan',
      status: 'ok',
      startedAt: 1000,
      endedAt: 1300,
      durationMs: 300,
    },
    {
      spanId: 's2',
      parentId: 's1',
      name: 'Generate answer',
      kind: 'llm',
      status: 'error',
      startedAt: 1300,
      endedAt: 2000,
      durationMs: 700,
      model: 'claude-sonnet-4-6',
      promptTokens: 50,
      completionTokens: 50,
      costUsd: 0.01,
      error: 'upstream timeout',
    },
  ],
};

describe('SpanWaterfall', () => {
  it('renders one track per span', () => {
    const wrapper = mount(SpanWaterfall, { props: { detail } });
    expect(wrapper.findAll('li')).toHaveLength(2);
  });

  it('surfaces llm model + token metadata', () => {
    const wrapper = mount(SpanWaterfall, { props: { detail } });
    expect(wrapper.text()).toContain('claude-sonnet-4-6');
  });

  it('shows the error message for a failed span', () => {
    const wrapper = mount(SpanWaterfall, { props: { detail } });
    expect(wrapper.text()).toContain('upstream timeout');
  });

  it('positions a mid-run span with a non-zero offset', () => {
    const wrapper = mount(SpanWaterfall, { props: { detail } });
    const bars = wrapper.findAll('li > div.h-2 > div');
    // Second span starts at 30% of the 1000ms run.
    expect(bars[1]?.attributes('style')).toContain('margin-left: 30%');
  });

  it('indents a child span by its tree depth', () => {
    const wrapper = mount(SpanWaterfall, { props: { detail } });
    const items = wrapper.findAll('li');
    expect(items[0]?.attributes('style')).toContain('padding-left: 0px');
    expect(items[1]?.attributes('style')).toContain('padding-left: 16px');
  });
});

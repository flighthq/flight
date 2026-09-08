import type { TextMarkupIssue } from '@flighthq/types/contract';

import { reportTextMarkupIssue, setTextMarkupGuard } from './textMarkupGuards';

const issue: TextMarkupIssue = { kind: 'unknown-tag', offset: 0, tag: 'widget', value: null };

afterEach(() => setTextMarkupGuard(null));

describe('reportTextMarkupIssue', () => {
  it('is silent when no guard is installed', () => {
    expect(() => reportTextMarkupIssue(issue)).not.toThrow();
  });
});

describe('setTextMarkupGuard', () => {
  it('replaces the active guard instead of accumulating callbacks', () => {
    const first: TextMarkupIssue[] = [];
    const second: TextMarkupIssue[] = [];
    setTextMarkupGuard((value) => first.push(value));
    setTextMarkupGuard((value) => second.push(value));
    reportTextMarkupIssue(issue);
    expect(first).toEqual([]);
    expect(second).toEqual([issue]);
  });
});

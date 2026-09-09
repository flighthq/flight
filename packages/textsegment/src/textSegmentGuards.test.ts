import { reportTextSegmenterUnavailable, setTextSegmentGuard } from './textSegmentGuards';

afterEach(() => setTextSegmentGuard(null));

describe('reportTextSegmenterUnavailable', () => {
  it('is silent when no guard is installed', () => {
    expect(() => reportTextSegmenterUnavailable()).not.toThrow();
  });
});

describe('setTextSegmentGuard', () => {
  it('replaces the active callback', () => {
    let first = 0;
    let second = 0;
    setTextSegmentGuard(() => first++);
    setTextSegmentGuard(() => second++);
    reportTextSegmenterUnavailable();
    expect(first).toBe(0);
    expect(second).toBe(1);
  });
});

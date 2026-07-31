import { resolveCaptureWorkerCount } from './captureWorkerCount';

describe('resolveCaptureWorkerCount', () => {
  it('derives the default from available parallelism with host headroom', () => {
    expect(resolveCaptureWorkerCount(undefined, undefined, 4)).toBe(3);
    expect(resolveCaptureWorkerCount(undefined, undefined, 1)).toBe(1);
  });

  it('keeps the automatic default at the four-worker expedient ceiling', () => {
    expect(resolveCaptureWorkerCount(undefined, undefined, 16)).toBe(4);
  });

  it('lets the environment pin a worker count above the automatic ceiling', () => {
    expect(resolveCaptureWorkerCount(undefined, '8', 16)).toBe(8);
  });

  it('lets the command-line flag override the environment', () => {
    expect(resolveCaptureWorkerCount('2', '8', 16)).toBe(2);
  });

  it('falls back to adaptive sizing for an invalid environment override', () => {
    expect(resolveCaptureWorkerCount(undefined, 'invalid', 8)).toBe(4);
  });

  it('preserves the existing minimum of one for an explicit zero', () => {
    expect(resolveCaptureWorkerCount('0', undefined, 8)).toBe(1);
  });
});

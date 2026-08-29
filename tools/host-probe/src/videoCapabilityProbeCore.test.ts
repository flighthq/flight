import { getVideoCapabilityBackend, resetVideoCapabilityBackendForTest } from '@flighthq/video/contract';

import { runVideoCapabilityBrowserProbe } from './videoCapabilityProbeCore';

afterEach(() => {
  resetVideoCapabilityBackendForTest();
  vi.restoreAllMocks();
});

describe('runVideoCapabilityBrowserProbe', () => {
  it('proves zero allocation before enable and for empty MIME, then exactly one per non-empty call', () => {
    const canPlayType = vi.spyOn(HTMLVideoElement.prototype, 'canPlayType').mockReturnValue('probably');
    const report = runVideoCapabilityBrowserProbe();

    expect(report).toMatchObject({
      results: [
        { allocations: 0, id: 'before-enable', status: 'pass' },
        { allocations: 0, id: 'enable', status: 'pass' },
        { allocations: 0, id: 'empty-mime', status: 'pass' },
        { actual: true, allocations: 1, expected: null, id: 'non-empty-first', status: 'pass' },
        { actual: true, allocations: 1, expected: null, id: 'non-empty-second', status: 'pass' },
      ],
      status: 'pass',
    });
    expect(canPlayType).toHaveBeenCalledTimes(2);
    expect(canPlayType).toHaveBeenNthCalledWith(1, 'video/mp4');
    expect(canPlayType).toHaveBeenNthCalledWith(2, 'video/mp4');
    expect(getVideoCapabilityBackend().canPlayType('video/supported')).toBe(false);
  });

  it('does not invent an expected support result for the real browser', () => {
    vi.spyOn(HTMLVideoElement.prototype, 'canPlayType').mockReturnValue('');
    const report = runVideoCapabilityBrowserProbe();
    expect(report.status).toBe('pass');
    expect(report.results.slice(-2)).toEqual([
      expect.objectContaining({ actual: false, allocations: 1, expected: null, status: 'pass' }),
      expect.objectContaining({ actual: false, allocations: 1, expected: null, status: 'pass' }),
    ]);
  });

  it('restores the document createElement identity after probing', () => {
    const createElement = document.createElement;
    runVideoCapabilityBrowserProbe();
    expect(document.createElement).toBe(createElement);
  });
});

import { getCaptureTimeoutMs, resolveCaptureTimeoutMs, setCaptureTimeoutMs } from './captureTimeout';

describe('getCaptureTimeoutMs', () => {
  afterEach(() => {
    setCaptureTimeoutMs(null);
    delete process.env['FLIGHT_CAPTURE_TIMEOUT_MS'];
  });

  it('defaults to the budget the edited constants used, so an unconfigured run is unchanged', () => {
    expect(getCaptureTimeoutMs()).toBe(15_000);
  });

  it('reads the environment when nothing is pinned', () => {
    process.env['FLIGHT_CAPTURE_TIMEOUT_MS'] = '45000';
    expect(getCaptureTimeoutMs()).toBe(45_000);
  });

  it('prefers a pinned budget over the environment', () => {
    process.env['FLIGHT_CAPTURE_TIMEOUT_MS'] = '45000';
    setCaptureTimeoutMs(9_000);
    expect(getCaptureTimeoutMs()).toBe(9_000);
  });

  it('falls back to the environment again once the pin is cleared', () => {
    process.env['FLIGHT_CAPTURE_TIMEOUT_MS'] = '45000';
    setCaptureTimeoutMs(9_000);
    setCaptureTimeoutMs(null);
    expect(getCaptureTimeoutMs()).toBe(45_000);
  });
});

describe('resolveCaptureTimeoutMs', () => {
  it('defaults when neither flag nor environment is given', () => {
    expect(resolveCaptureTimeoutMs(undefined, undefined)).toBe(15_000);
  });

  it('takes the environment when no flag is given', () => {
    expect(resolveCaptureTimeoutMs(undefined, '30000')).toBe(30_000);
  });

  it('lets the flag win over the environment', () => {
    expect(resolveCaptureTimeoutMs('20000', '30000')).toBe(20_000);
  });

  // A zero or negative budget expires every wait immediately, so every page reports as stalled — which
  // reads as a fleet-wide rendering failure rather than as the typo it is.
  it('ignores a non-positive budget rather than honoring it', () => {
    expect(resolveCaptureTimeoutMs('0', undefined)).toBe(15_000);
    expect(resolveCaptureTimeoutMs('-1', undefined)).toBe(15_000);
  });

  it('ignores a non-numeric budget', () => {
    expect(resolveCaptureTimeoutMs('soon', undefined)).toBe(15_000);
  });

  it('falls through a rejected flag to the environment', () => {
    expect(resolveCaptureTimeoutMs('0', '30000')).toBe(30_000);
  });
});

describe('setCaptureTimeoutMs', () => {
  afterEach(() => setCaptureTimeoutMs(null));

  it('pins the budget every capture wait reads', () => {
    setCaptureTimeoutMs(1_234);
    expect(getCaptureTimeoutMs()).toBe(1_234);
  });
});

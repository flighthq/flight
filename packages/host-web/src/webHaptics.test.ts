import { initializeWebHapticsBackend, webHapticsBackend } from './webHaptics';

describe('initializeWebHapticsBackend', () => {
  it('is the construction initializer of createWebHapticsBackend', () => {
    expect(typeof initializeWebHapticsBackend).toBe('function');
  });
});
describe('webHapticsBackend', () => {
  it('reports unsupported and refuses every operation when navigator.vibrate is absent', () => {
    // jsdom has no Vibration API, which is the branch every desktop browser also takes. The backend must
    // answer false rather than throw: an absent motor is an expected outcome, not a programmer error.
    expect(webHapticsBackend.isSupported()).toBe(false);
    expect(webHapticsBackend.vibrate(10)).toBe(false);
    expect(webHapticsBackend.cancel()).toBe(false);
    expect(webHapticsBackend.selection()).toBe(false);
    expect(webHapticsBackend.impact('heavy')).toBe(false);
    expect(webHapticsBackend.notification('error')).toBe(false);
  });

  it('reports no intensity or amplitude control even where patterns are available', () => {
    const out = {
      amplitudeControl: true,
      customEvents: true,
      intensity: true,
      patterns: true,
      supported: true,
    };
    webHapticsBackend.capabilities(out);
    // Web vibration can only buzz for a duration; claiming intensity would misreport the platform.
    expect(out.amplitudeControl).toBe(false);
    expect(out.intensity).toBe(false);
    expect(out.customEvents).toBe(false);
  });

  it('rejects an empty pattern before touching the platform', () => {
    expect(webHapticsBackend.vibratePattern([])).toBe(false);
  });

  it('omits vibrateWaveform rather than faking it, so callers fall back honestly', () => {
    expect(webHapticsBackend.vibrateWaveform).toBeUndefined();
  });
});

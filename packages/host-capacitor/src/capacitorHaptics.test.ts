import type { HapticsCapabilities } from '@flighthq/types';

import { createCapacitorHapticsBackend } from './capacitorHaptics';
import type { CapacitorApi } from './capacitorModule';

function fakeCapacitor() {
  const calls: Array<{ method: string; arg?: unknown }> = [];
  const capacitor = {
    haptics: {
      async impact(arg: unknown) {
        calls.push({ method: 'impact', arg });
      },
      async notification(arg: unknown) {
        calls.push({ method: 'notification', arg });
      },
      async selectionChanged() {
        calls.push({ method: 'selectionChanged' });
      },
      async selectionStart() {
        calls.push({ method: 'selectionStart' });
      },
      async selectionEnd() {
        calls.push({ method: 'selectionEnd' });
      },
      async vibrate(arg: unknown) {
        calls.push({ method: 'vibrate', arg });
      },
    },
  } as unknown as CapacitorApi;
  return { capacitor, calls };
}

describe('createCapacitorHapticsBackend', () => {
  it('maps impact styles onto Capacitor enums', () => {
    const { capacitor, calls } = fakeCapacitor();
    const backend = createCapacitorHapticsBackend(capacitor);
    expect(backend.impact('soft')).toBe(true);
    expect(backend.impact('rigid')).toBe(true);
    expect(calls[0].arg).toEqual({ style: 'LIGHT' });
    expect(calls[1].arg).toEqual({ style: 'HEAVY' });
  });

  it('maps notification, selection, and vibrate', () => {
    const { capacitor, calls } = fakeCapacitor();
    const backend = createCapacitorHapticsBackend(capacitor);
    expect(backend.notification('success')).toBe(true);
    expect(backend.selection()).toBe(true);
    expect(backend.vibrate(200)).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(['notification', 'selectionChanged', 'vibrate']);
    expect(calls[0].arg).toEqual({ type: 'SUCCESS' });
    expect(calls[2].arg).toEqual({ duration: 200 });
  });

  it('reports capabilities and unsupported operations', () => {
    const backend = createCapacitorHapticsBackend(fakeCapacitor().capacitor);
    const out: HapticsCapabilities = {
      amplitudeControl: true,
      customEvents: true,
      intensity: true,
      patterns: true,
      supported: false,
    };
    expect(backend.capabilities(out)).toBe(out);
    expect(out).toEqual({
      amplitudeControl: false,
      customEvents: false,
      intensity: false,
      patterns: false,
      supported: true,
    });
    expect(backend.cancel()).toBe(false);
    expect(backend.vibratePattern([10, 20])).toBe(false);
    expect(backend.isSupported()).toBe(true);
  });
});

import type {
  HapticImpactStyle,
  HapticNotificationType,
  HostHapticsProvider,
  HapticsCapabilities,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  cancelDeviceVibration,
  getHapticsCapabilities,
  isHapticsSupported,
  prepareHaptics,
  triggerHapticImpact,
  triggerHapticNotification,
  triggerHapticSelection,
  vibrateDevice,
  vibrateDevicePattern,
  vibrateDeviceWaveform,
} from './haptics';

interface RecordedCall {
  readonly args: readonly unknown[];
  readonly name: string;
}

function makeCapabilities(overrides: Partial<HapticsCapabilities> = {}): HapticsCapabilities {
  return {
    amplitudeControl: false,
    customEvents: false,
    intensity: false,
    patterns: false,
    supported: false,
    ...overrides,
  };
}

// A host carrying a recording haptics provider. Every operation is explicit here — there is no ambient
// slot to install into and nothing to reset between tests, which is the point of the migration: two
// tests can hold two different providers at once without interfering.
function makeHost(overrides: Partial<HostHapticsProvider> = {}): {
  calls: RecordedCall[];
  host: { readonly input: { readonly haptics: HostHapticsProvider } };
} {
  const calls: RecordedCall[] = [];
  const record =
    (name: string, result: boolean) =>
    (...args: unknown[]): boolean => {
      calls.push({ args, name });
      return result;
    };
  const haptics: HostHapticsProvider = {
    [EntityRuntimeKey]: undefined,
    cancel: record('cancel', true),
    capabilities(out: HapticsCapabilities): HapticsCapabilities {
      calls.push({ args: [], name: 'capabilities' });
      out.patterns = true;
      out.supported = true;
      return out;
    },
    impact: record('impact', true) as HostHapticsProvider['impact'],
    isSupported: record('isSupported', true) as HostHapticsProvider['isSupported'],
    notification: record('notification', true) as HostHapticsProvider['notification'],
    selection: record('selection', true) as HostHapticsProvider['selection'],
    vibrate: record('vibrate', true) as HostHapticsProvider['vibrate'],
    vibratePattern: record('vibratePattern', true) as HostHapticsProvider['vibratePattern'],
    ...overrides,
  };
  return { calls, host: { input: { haptics } } };
}

describe('cancelDeviceVibration', () => {
  it('forwards to the selected provider', () => {
    const { calls, host } = makeHost();
    expect(cancelDeviceVibration(host.input.haptics)).toBe(true);
    expect(calls.map((call) => call.name)).toEqual(['cancel']);
  });

  it('returns whatever the provider reports rather than assuming success', () => {
    const { host } = makeHost({ cancel: () => false });
    expect(cancelDeviceVibration(host.input.haptics)).toBe(false);
  });
});

describe('getHapticsCapabilities', () => {
  it('fills and returns the caller-owned out parameter', () => {
    const { host } = makeHost();
    const out = makeCapabilities();
    expect(getHapticsCapabilities(host.input.haptics, out)).toBe(out);
    expect(out.supported).toBe(true);
    expect(out.patterns).toBe(true);
  });

  // ★ Two hosts, two providers, no interference. Under the ambient model the second install either
  // overwrote the first or was refused as a conflict; there was exactly one answer per process.
  it('reports each host independently when two providers are live at once', () => {
    const supported = makeHost();
    const unsupported = makeHost({
      capabilities: (out: HapticsCapabilities): HapticsCapabilities => {
        out.supported = false;
        out.patterns = false;
        return out;
      },
    });

    expect(getHapticsCapabilities(supported.host.input.haptics, makeCapabilities()).supported).toBe(true);
    expect(getHapticsCapabilities(unsupported.host.input.haptics, makeCapabilities()).supported).toBe(false);
  });
});

describe('isHapticsSupported', () => {
  it('forwards to the selected provider', () => {
    const { host } = makeHost();
    expect(isHapticsSupported(host.input.haptics)).toBe(true);
  });

  it('reports false for a provider that says so', () => {
    const { host } = makeHost({ isSupported: () => false });
    expect(isHapticsSupported(host.input.haptics)).toBe(false);
  });
});

describe('prepareHaptics', () => {
  it('calls prepare on providers that implement it', () => {
    let prepared = false;
    const { host } = makeHost({
      prepare: (): void => {
        prepared = true;
      },
    });
    prepareHaptics(host.input.haptics);
    expect(prepared).toBe(true);
  });

  // prepare is optional on HapticsBackend. A provider that does not pre-allocate is not a broken
  // provider, so the absence has to be silent rather than a throw.
  it('does nothing when the provider omits prepare', () => {
    const { host } = makeHost();
    expect(host.input.haptics.prepare).toBeUndefined();
    expect(() => prepareHaptics(host.input.haptics)).not.toThrow();
  });
});

describe('triggerHapticImpact', () => {
  it('forwards the style and defaults intensity to 1', () => {
    const { calls, host } = makeHost();
    triggerHapticImpact(host.input.haptics, 'heavy');
    expect(calls[0]).toEqual({ args: ['heavy', 1], name: 'impact' });
  });

  it('forwards an explicit intensity unchanged', () => {
    const { calls, host } = makeHost();
    triggerHapticImpact(host.input.haptics, 'light', 0.25);
    expect(calls[0]).toEqual({ args: ['light', 0.25], name: 'impact' });
  });

  it('forwards every impact style', () => {
    const styles: readonly HapticImpactStyle[] = ['heavy', 'light', 'medium', 'rigid', 'soft'];
    const { calls, host } = makeHost();
    for (const style of styles) triggerHapticImpact(host.input.haptics, style);
    expect(calls.map((call) => call.args[0])).toEqual(styles);
  });
});

describe('triggerHapticNotification', () => {
  it('forwards every notification type', () => {
    const types: readonly HapticNotificationType[] = ['error', 'success', 'warning'];
    const { calls, host } = makeHost();
    for (const type of types) triggerHapticNotification(host.input.haptics, type);
    expect(calls.map((call) => call.args[0])).toEqual(types);
  });
});

describe('triggerHapticSelection', () => {
  it('forwards to the selected provider', () => {
    const { calls, host } = makeHost();
    expect(triggerHapticSelection(host.input.haptics)).toBe(true);
    expect(calls.map((call) => call.name)).toEqual(['selection']);
  });
});

describe('vibrateDevice', () => {
  it('forwards the duration to the selected provider', () => {
    const { calls, host } = makeHost();
    vibrateDevice(host.input.haptics, 42);
    expect(calls[0]).toEqual({ args: [42], name: 'vibrate' });
  });
});

describe('vibrateDevicePattern', () => {
  it('forwards a non-empty pattern', () => {
    const { calls, host } = makeHost();
    vibrateDevicePattern(host.input.haptics, [10, 20]);
    expect(calls[0]).toEqual({ args: [[10, 20]], name: 'vibratePattern' });
  });

  it('rejects an empty pattern before reaching the provider', () => {
    const { calls, host } = makeHost();
    expect(vibrateDevicePattern(host.input.haptics, [])).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('vibrateDeviceWaveform', () => {
  it('uses vibrateWaveform when the provider implements it', () => {
    const { calls, host } = makeHost({
      vibrateWaveform: (...args: unknown[]): boolean => {
        calls.push({ args, name: 'vibrateWaveform' });
        return true;
      },
    } as Partial<HostHapticsProvider>);
    expect(vibrateDeviceWaveform(host.input.haptics, [10, 20], [255, 128], 1)).toBe(true);
    expect(calls[0]).toEqual({ args: [[10, 20], [255, 128], 1], name: 'vibrateWaveform' });
  });

  // The fallback drops amplitudes rather than failing. Every provider can express timings, so a
  // provider without amplitude support should still buzz rather than silently do nothing.
  it('falls back to vibratePattern with the timings when vibrateWaveform is absent', () => {
    const { calls, host } = makeHost();
    expect(host.input.haptics.vibrateWaveform).toBeUndefined();
    expect(vibrateDeviceWaveform(host.input.haptics, [10, 20], [255, 128])).toBe(true);
    expect(calls[0]).toEqual({ args: [[10, 20]], name: 'vibratePattern' });
  });

  it('rejects empty timings before reaching either path', () => {
    const { calls, host } = makeHost();
    expect(vibrateDeviceWaveform(host.input.haptics, [], [])).toBe(false);
    expect(calls).toEqual([]);
  });
});

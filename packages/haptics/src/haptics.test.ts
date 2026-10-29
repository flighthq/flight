// Generated from crates/flight-haptics/tests/haptics_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

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
} from './contract.ts';
import type {
  HapticImpactStyle,
  HapticNotificationType,
  HapticsCapabilities,
  HostHapticsCapability,
} from './contract.ts';

type Calls = { value: RecordedCalls };

interface RecordedCalls {
  impacts: Array<readonly [HapticImpactStyle, number | undefined]>;
  names: string[];
  notifications: HapticNotificationType[];
  patterns: number[][];
  vibrations: number[];
  waveforms: Array<readonly [number[], number[], number | undefined]>;
}

function makeHost(): readonly [Calls, HostHapticsCapability] {
  const calls: Readonly<{ value: RecordedCalls }> = {
    value: { impacts: [], names: [], notifications: [], patterns: [], vibrations: [], waveforms: [] },
  };
  const cancelCalls = calls;
  const capabilitiesCalls = calls;
  const impactCalls = calls;
  const isSupportedCalls = calls;
  const notificationCalls = calls;
  const selectionCalls = calls;
  const vibrateCalls = calls;
  const patternCalls = calls;
  const host: HostHapticsCapability = {
    cancel: () => {
      cancelCalls.value.names.push('cancel');
      return true;
    },
    capabilities: (out) => {
      capabilitiesCalls.value.names.push('capabilities');
      out.patterns = true;
      out.supported = true;
    },
    impact: (style, intensity) => {
      let calls = impactCalls.value;
      calls.names.push('impact');
      calls.impacts.push([style, intensity]);
      return true;
    },
    isSupported: () => {
      isSupportedCalls.value.names.push('isSupported');
      return true;
    },
    notification: (notificationType) => {
      let calls = notificationCalls.value;
      calls.names.push('notification');
      calls.notifications.push(notificationType);
      return true;
    },
    prepare: undefined,
    selection: () => {
      selectionCalls.value.names.push('selection');
      return true;
    },
    vibrate: (durationMs) => {
      let calls = vibrateCalls.value;
      calls.names.push('vibrate');
      calls.vibrations.push(durationMs);
      return true;
    },
    vibratePattern: (pattern) => {
      let calls = patternCalls.value;
      calls.names.push('vibratePattern');
      calls.patterns.push(pattern.slice());
      return true;
    },
    vibrateWaveform: undefined,
  };
  return [calls, host];
}

function makeCapabilities(): HapticsCapabilities {
  return { amplitudeControl: false, customEvents: false, intensity: false, patterns: false, supported: false };
}

describe('cancelDeviceVibration', () => {
  it('forwards to the selected provider', () => {
    const [calls, host] = makeHost();
    expect(cancelDeviceVibration(host)).toBe(true);
    expect(calls.value.names).toEqual(['cancel']);
  });
  it('returns whatever the provider reports rather than assuming success', () => {
    let [, host] = makeHost();
    host.cancel = () => false;
    expect(!cancelDeviceVibration(host)).toBe(true);
  });
});

describe('getHapticsCapabilities', () => {
  it('fills and returns the caller owned out parameter', () => {
    const [, host] = makeHost();
    let out = makeCapabilities();
    getHapticsCapabilities(out, host);
    expect(out.supported).toBe(true);
    expect(out.patterns).toBe(true);
  });
  it('reports each host independently when two providers are live at once', () => {
    const [, supported] = makeHost();
    let [, unsupported] = makeHost();
    unsupported.capabilities = (out) => {
      out.supported = false;
      out.patterns = false;
    };
    let supportedOut = makeCapabilities();
    let unsupportedOut = makeCapabilities();
    getHapticsCapabilities(supportedOut, supported);
    getHapticsCapabilities(unsupportedOut, unsupported);
    expect(supportedOut.supported).toBe(true);
    expect(!unsupportedOut.supported).toBe(true);
  });
});

describe('isHapticsSupported', () => {
  it('forwards to the selected provider', () => {
    const [, host] = makeHost();
    expect(isHapticsSupported(host)).toBe(true);
  });
  it('reports false for a provider that says so', () => {
    let [, host] = makeHost();
    host.isSupported = () => false;
    expect(!isHapticsSupported(host)).toBe(true);
  });
});

describe('prepareHaptics', () => {
  it('calls prepare on providers that implement it', () => {
    let [calls, host] = makeHost();
    const prepareCalls = calls;
    host.prepare = () => {
      prepareCalls.value.names.push('prepare');
    };
    prepareHaptics(host);
    expect(calls.value.names).toEqual(['prepare']);
  });
  it('does nothing when the provider omits prepare', () => {
    const [calls, host] = makeHost();
    expect(host.prepare === undefined).toBe(true);
    prepareHaptics(host);
    expect(calls.value.names.length === 0).toBe(true);
  });
});

describe('triggerHapticImpact', () => {
  it('forwards the style and defaults intensity to 1', () => {
    const [calls, host] = makeHost();
    triggerHapticImpact(host, 'heavy', undefined);
    expect(calls.value.impacts).toEqual([['heavy', 1.0]]);
  });
  it('forwards an explicit intensity unchanged', () => {
    const [calls, host] = makeHost();
    triggerHapticImpact(host, 'light', 0.25);
    expect(calls.value.impacts).toEqual([['light', 0.25]]);
  });
  it('forwards every impact style', () => {
    const styles = ['heavy', 'light', 'medium', 'rigid', 'soft'] as const;
    const [calls, host] = makeHost();
    for (const style of styles) {
      triggerHapticImpact(host, style, undefined);
    }
    const actual: HapticImpactStyle[] = calls.value.impacts.map(([style, _unused0]) => style);
    expect(actual).toEqual(styles);
  });
});

describe('triggerHapticNotification', () => {
  it('forwards every notification type', () => {
    const notificationTypes = ['error', 'success', 'warning'] as const;
    const [calls, host] = makeHost();
    for (const notificationType of notificationTypes) {
      triggerHapticNotification(host, notificationType);
    }
    expect(calls.value.notifications).toEqual(notificationTypes);
  });
});

describe('triggerHapticSelection', () => {
  it('forwards to the selected provider', () => {
    const [calls, host] = makeHost();
    expect(triggerHapticSelection(host)).toBe(true);
    expect(calls.value.names).toEqual(['selection']);
  });
});

describe('vibrateDevice', () => {
  it('forwards the duration to the selected provider', () => {
    const [calls, host] = makeHost();
    vibrateDevice(host, 42.0);
    expect(calls.value.vibrations).toEqual([42.0]);
  });
});

describe('vibrateDevicePattern', () => {
  it('forwards a non empty pattern', () => {
    const [calls, host] = makeHost();
    const pattern = [10.0, 20.0];
    vibrateDevicePattern(host, pattern);
    expect(calls.value.patterns).toEqual([pattern]);
  });
  it('rejects an empty pattern before reaching the provider', () => {
    const [calls, host] = makeHost();
    expect(!vibrateDevicePattern(host, [] as never[])).toBe(true);
    expect(calls.value.names.length === 0).toBe(true);
  });
});

describe('vibrateDeviceWaveform', () => {
  function installWaveform(host: HostHapticsCapability, calls: Readonly<Calls>): void {
    const waveformCalls = calls;
    host.vibrateWaveform = (timings, amplitudes, repeat) => {
      let calls = waveformCalls.value;
      calls.names.push('vibrateWaveform');
      calls.waveforms.push([timings.slice(), amplitudes.slice(), repeat]);
      return true;
    };
  }
  it('uses vibrate waveform when the provider implements it', () => {
    let [calls, host] = makeHost();
    installWaveform(host, calls);
    const timings = [10.0, 20.0];
    const amplitudes = [255.0, 128.0];
    expect(vibrateDeviceWaveform(host, timings, amplitudes, 1)).toBe(true);
    expect(calls.value.waveforms).toEqual([[timings, amplitudes, 1]]);
  });
  it('falls back to vibrate pattern with the timings when vibrate waveform is absent', () => {
    const [calls, host] = makeHost();
    expect(host.vibrateWaveform === undefined).toBe(true);
    const timings = [10.0, 20.0];
    const amplitudes = [255.0, 128.0];
    expect(vibrateDeviceWaveform(host, timings, amplitudes, undefined)).toBe(true);
    expect(calls.value.patterns).toEqual([timings]);
  });
  it('rejects empty timings before reaching either path', () => {
    const [calls, host] = makeHost();
    expect(!vibrateDeviceWaveform(host, [] as never[], [] as never[], undefined)).toBe(true);
    expect(calls.value.names.length === 0).toBe(true);
  });
  it('defaults repeat to negative 1', () => {
    let [calls, host] = makeHost();
    installWaveform(host, calls);
    const timings = [10.0];
    const amplitudes = [255.0];
    expect(vibrateDeviceWaveform(host, timings, amplitudes, undefined)).toBe(true);
    expect(calls.value.waveforms).toEqual([[timings, amplitudes, -1]]);
  });
});

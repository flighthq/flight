import type { AudioDeviceBackend } from '@flighthq/types/contract';

import {
  createWebAudioDeviceBackend,
  explainAudioDeviceBackend,
  explainAudioDeviceOperation,
  getAudioDeviceBackend,
  hasAudioDeviceOperation,
  installAudioDeviceHostBackend,
  resetAudioDeviceBackendForTest,
  setAudioDeviceBackend,
} from './audioDeviceBackend';

afterEach(() => {
  resetAudioDeviceBackendForTest();
});

describe('explainAudioDeviceBackend', () => {
  it('reports host-not-enabled when no backend is installed', () => {
    expect(explainAudioDeviceBackend().layer).toBe('host-not-enabled');
  });

  it('reports custom layer when a custom backend is set', () => {
    setAudioDeviceBackend(stubBackend());
    expect(explainAudioDeviceBackend().layer).toBe('custom');
  });

  it('reports host layer when a host backend is installed', () => {
    installAudioDeviceHostBackend(stubBackend());
    expect(explainAudioDeviceBackend().layer).toBe('host');
  });

  it('reports conflict when two different host backends are installed', () => {
    installAudioDeviceHostBackend(stubBackend());
    installAudioDeviceHostBackend(stubBackend());
    expect(explainAudioDeviceBackend().conflict).toBe(true);
  });

  it('does not report conflict when the same backend is installed twice', () => {
    const backend = stubBackend();
    installAudioDeviceHostBackend(backend);
    installAudioDeviceHostBackend(backend);
    expect(explainAudioDeviceBackend().conflict).toBe(false);
  });
});

describe('explainAudioDeviceOperation', () => {
  it('reports implemented for a host backend operation', () => {
    installAudioDeviceHostBackend(stubBackend());
    expect(explainAudioDeviceOperation('createDevice').implemented).toBe(true);
    expect(explainAudioDeviceOperation('createDevice').layer).toBe('host');
  });

  it('reports sentinel when no backend is installed', () => {
    expect(explainAudioDeviceOperation('createDevice').implemented).toBe(false);
    expect(explainAudioDeviceOperation('createDevice').layer).toBe('sentinel');
  });
});

describe('getAudioDeviceBackend', () => {
  it('returns the sentinel when no backend is installed', () => {
    const backend = getAudioDeviceBackend();
    expect(backend.getDeviceTime(0 as never)).toBe(0);
  });

  it('returns a custom backend over a host backend', () => {
    const host = stubBackend();
    const custom = stubBackend();
    installAudioDeviceHostBackend(host);
    setAudioDeviceBackend(custom);
    expect(getAudioDeviceBackend()).toBe(custom);
  });

  it('returns a host backend when no custom is set', () => {
    const host = stubBackend();
    installAudioDeviceHostBackend(host);
    expect(getAudioDeviceBackend()).toBe(host);
  });
});

describe('hasAudioDeviceOperation', () => {
  it('returns false for the sentinel', () => {
    expect(hasAudioDeviceOperation('createDevice')).toBe(false);
  });

  it('returns true for an installed backend', () => {
    installAudioDeviceHostBackend(stubBackend());
    expect(hasAudioDeviceOperation('createDevice')).toBe(true);
  });
});

describe('sentinel', () => {
  it('returns 0 from createDevice', () => {
    expect(getAudioDeviceBackend().createDevice(44100) as number).toBe(0);
  });

  it('returns 0 from createBuffer', () => {
    expect(getAudioDeviceBackend().createBuffer(0 as never, 1, 1, 44100, []) as number).toBe(0);
  });

  it('returns 0 from createSource', () => {
    expect(getAudioDeviceBackend().createSource(0 as never, 0 as never) as number).toBe(0);
  });

  it('returns 0 from getDeviceTime', () => {
    expect(getAudioDeviceBackend().getDeviceTime(0 as never)).toBe(0);
  });

  it('is a no-op for destroyDevice', () => {
    expect(() => getAudioDeviceBackend().destroyDevice(0 as never)).not.toThrow();
  });

  it('is a no-op for destroyBuffer', () => {
    expect(() => getAudioDeviceBackend().destroyBuffer(0 as never)).not.toThrow();
  });

  it('is a no-op for destroySource', () => {
    expect(() => getAudioDeviceBackend().destroySource(0 as never)).not.toThrow();
  });

  it('is a no-op for startSource', () => {
    expect(() => getAudioDeviceBackend().startSource(0 as never, 0)).not.toThrow();
  });

  it('is a no-op for stopSource', () => {
    expect(() => getAudioDeviceBackend().stopSource(0 as never)).not.toThrow();
  });

  it('is a no-op for setSourceGain', () => {
    expect(() => getAudioDeviceBackend().setSourceGain(0 as never, 1)).not.toThrow();
  });

  it('is a no-op for setSourcePlaybackRate', () => {
    expect(() => getAudioDeviceBackend().setSourcePlaybackRate(0 as never, 1)).not.toThrow();
  });

  it('is a no-op for onSourceEnded', () => {
    expect(() => getAudioDeviceBackend().onSourceEnded(0 as never, null)).not.toThrow();
  });

  it('is a no-op for resumeDevice', () => {
    expect(() => getAudioDeviceBackend().resumeDevice(0 as never)).not.toThrow();
  });
});

function stubBackend(): AudioDeviceBackend {
  return {
    createBuffer: vi.fn().mockReturnValue(1),
    createDevice: vi.fn().mockReturnValue(1),
    createSource: vi.fn().mockReturnValue(1),
    destroyBuffer: vi.fn(),
    destroyDevice: vi.fn(),
    destroySource: vi.fn(),
    getDeviceTime: vi.fn().mockReturnValue(0),
    onSourceEnded: vi.fn(),
    resumeDevice: vi.fn(),
    setSourceGain: vi.fn(),
    setSourcePlaybackRate: vi.fn(),
    startSource: vi.fn(),
    stopSource: vi.fn(),
  };
}

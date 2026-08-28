import {
  explainAudioDeviceBackend,
  getAudioDeviceBackend,
  resetAudioDeviceBackendForTest,
} from '@flighthq/media/contract';

import { enableHostWebAudioDevice, resetHostWebAudioDeviceForTest } from './webAudioDevice';

afterEach(() => {
  resetHostWebAudioDeviceForTest();
  resetAudioDeviceBackendForTest();
});

describe('enableHostWebAudioDevice', () => {
  it('installs the host backend', () => {
    enableHostWebAudioDevice();
    expect(explainAudioDeviceBackend().layer).toBe('host');
  });

  it('is idempotent', () => {
    enableHostWebAudioDevice();
    enableHostWebAudioDevice();
    expect(explainAudioDeviceBackend().conflict).toBe(false);
  });

  it('provides all 13 operations', () => {
    enableHostWebAudioDevice();
    const backend = getAudioDeviceBackend();
    expect(typeof backend.createBuffer).toBe('function');
    expect(typeof backend.createDevice).toBe('function');
    expect(typeof backend.createSource).toBe('function');
    expect(typeof backend.destroyBuffer).toBe('function');
    expect(typeof backend.destroyDevice).toBe('function');
    expect(typeof backend.destroySource).toBe('function');
    expect(typeof backend.getDeviceTime).toBe('function');
    expect(typeof backend.onSourceEnded).toBe('function');
    expect(typeof backend.resumeDevice).toBe('function');
    expect(typeof backend.setSourceGain).toBe('function');
    expect(typeof backend.setSourcePlaybackRate).toBe('function');
    expect(typeof backend.startSource).toBe('function');
    expect(typeof backend.stopSource).toBe('function');
  });
});

describe('resetHostWebAudioDeviceForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebAudioDevice();
    resetHostWebAudioDeviceForTest();
    resetAudioDeviceBackendForTest();
    expect(() => enableHostWebAudioDevice()).not.toThrow();
  });
});

import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createWebAudioDeviceBackend, webAudioDeviceBackend } from './webAudioDevice';

describe('createWebAudioDeviceBackend', () => {
  it('returns an Entity', () => {
    expect(EntityRuntimeKey in createWebAudioDeviceBackend()).toBe(true);
  });

  it('returns a fresh instance on each call', () => {
    expect(createWebAudioDeviceBackend()).not.toBe(createWebAudioDeviceBackend());
  });

  it('exposes all required backend operations', () => {
    const backend = createWebAudioDeviceBackend();
    expect(backend.createBuffer).toBeTypeOf('function');
    expect(backend.createDevice).toBeTypeOf('function');
    expect(backend.createSource).toBeTypeOf('function');
    expect(backend.destroyBuffer).toBeTypeOf('function');
    expect(backend.destroyDevice).toBeTypeOf('function');
    expect(backend.destroySource).toBeTypeOf('function');
    expect(backend.getDeviceTime).toBeTypeOf('function');
    expect(backend.onSourceEnded).toBeTypeOf('function');
    expect(backend.resumeDevice).toBeTypeOf('function');
    expect(backend.setSourceGain).toBeTypeOf('function');
    expect(backend.setSourcePlaybackRate).toBeTypeOf('function');
    expect(backend.startSource).toBeTypeOf('function');
    expect(backend.stopSource).toBeTypeOf('function');
  });
});

describe('webAudioDeviceBackend', () => {
  it('is an Entity', () => {
    expect(EntityRuntimeKey in webAudioDeviceBackend).toBe(true);
  });

  it('is a stable singleton', () => {
    expect(webAudioDeviceBackend).toBe(webAudioDeviceBackend);
  });
});

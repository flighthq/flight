import type { WebcamStream } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { createWebcamStreamEntity, getWebcamStreamRuntime } from './webcamStream';

describe('createWebcamStreamEntity', () => {
  it('creates a WebcamStream with the correct public fields', () => {
    const stream = createWebcamStreamEntity({
      active: true,
      deviceId: 'device-1',
      facingMode: 'environment',
      frameRate: 30,
      height: 480,
      id: 'stream-123',
      width: 640,
    });
    expect(stream.active).toBe(true);
    expect(stream.deviceId).toBe('device-1');
    expect(stream.facingMode).toBe('environment');
    expect(stream.frameRate).toBe(30);
    expect(stream.height).toBe(480);
    expect(stream.id).toBe('stream-123');
    expect(stream.width).toBe(640);
  });

  it('attaches a runtime slot to the entity', () => {
    const stream = createWebcamStreamEntity({
      active: true,
      deviceId: '',
      facingMode: null,
      frameRate: 0,
      height: 0,
      id: 'x',
      width: 0,
    });
    expect(stream[EntityRuntimeKey]).not.toBeUndefined();
  });

  it('runtime slot is initialized (mediaStream placeholder is present)', () => {
    const stream = createWebcamStreamEntity({
      active: false,
      deviceId: '',
      facingMode: null,
      frameRate: 0,
      height: 0,
      id: 'x',
      width: 0,
    });
    const rt = getWebcamStreamRuntime(stream);
    expect(rt).not.toBeNull();
    // mediaStream starts null; the caller attaches a live stream before use.
    expect(rt?.mediaStream).toBeNull();
    expect(rt?.videoElement).toBeNull();
  });
});

describe('getWebcamStreamRuntime', () => {
  it('returns null for a stream without a runtime', () => {
    const stream = {
      active: true,
      deviceId: '',
      facingMode: null,
      frameRate: 0,
      height: 0,
      id: 'x',
      width: 0,
      [EntityRuntimeKey]: undefined,
    } as WebcamStream;
    expect(getWebcamStreamRuntime(stream)).toBeNull();
  });

  it('returns the runtime for a stream created by createWebcamStreamEntity', () => {
    const stream = createWebcamStreamEntity({
      active: true,
      deviceId: 'dev',
      facingMode: 'user',
      frameRate: 60,
      height: 720,
      id: 'stream-rt',
      width: 1280,
    });
    const rt = getWebcamStreamRuntime(stream);
    expect(rt).not.toBeNull();
    expect(rt?.videoElement).toBeNull();
  });
});

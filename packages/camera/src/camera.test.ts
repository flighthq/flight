import type { CameraBackend, CameraCaptureOptions } from '@flighthq/types';

import {
  createWebCameraBackend,
  getCameraBackend,
  pickCameraImage,
  recordCameraVideo,
  requestCameraPermission,
  setCameraBackend,
  takeCameraPhoto,
} from './camera';

function fakeBackend(): CameraBackend & { lastOptions: CameraCaptureOptions | null } {
  return {
    lastOptions: null,
    async capture(options) {
      this.lastOptions = { ...options };
      return { dataURL: 'data:image/png;base64,xx', width: 0, height: 0, format: 'image/png' };
    },
    async captureVideo(options) {
      this.lastOptions = { ...options };
      return { dataURL: 'data:video/mp4;base64,xx', duration: 0, format: 'video/mp4' };
    },
    async requestPermission() {
      return true;
    },
  };
}

afterEach(() => setCameraBackend(null));

describe('createWebCameraBackend', () => {
  it('returns a backend whose capture yields a Promise without throwing synchronously', () => {
    const backend = createWebCameraBackend();
    expect(backend.capture({}) instanceof Promise).toBe(true);
  });
});

describe('getCameraBackend', () => {
  it('falls back to a web backend', () => {
    expect(getCameraBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setCameraBackend(backend);
    expect(getCameraBackend()).toBe(backend);
  });
});

describe('pickCameraImage', () => {
  it('captures with the photos source', async () => {
    const backend = fakeBackend();
    setCameraBackend(backend);
    const photo = await pickCameraImage({ quality: 0.5 });
    expect(photo).not.toBeNull();
    expect(backend.lastOptions).toEqual({ quality: 0.5, source: 'photos' });
  });
});

describe('recordCameraVideo', () => {
  it('captures video with the camera source', async () => {
    const backend = fakeBackend();
    setCameraBackend(backend);
    const video = await recordCameraVideo({ maxDurationMs: 5000 });
    expect(video).not.toBeNull();
    expect(backend.lastOptions).toEqual({ maxDurationMs: 5000, source: 'camera' });
  });

  it('returns a Promise from the web backend without throwing', () => {
    const backend = createWebCameraBackend();
    expect(backend.captureVideo({}) instanceof Promise).toBe(true);
  });
});

describe('requestCameraPermission', () => {
  it('delegates to the active backend', async () => {
    setCameraBackend(fakeBackend());
    expect(await requestCameraPermission()).toBe(true);
  });

  it('returns a boolean from the web backend without throwing', async () => {
    expect(typeof (await requestCameraPermission())).toBe('boolean');
  });
});

describe('setCameraBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setCameraBackend(fakeBackend());
    setCameraBackend(null);
    expect(getCameraBackend()).not.toBeNull();
  });
});

describe('takeCameraPhoto', () => {
  it('captures with the camera source', async () => {
    const backend = fakeBackend();
    setCameraBackend(backend);
    const photo = await takeCameraPhoto({ allowEditing: true });
    expect(photo).not.toBeNull();
    expect(backend.lastOptions).toEqual({ allowEditing: true, source: 'camera' });
  });
});

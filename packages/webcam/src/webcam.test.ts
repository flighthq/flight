import type { WebcamBackend, WebcamCaptureOptions } from '@flighthq/types';

import {
  createWebWebcamBackend,
  getWebcamBackend,
  recordWebcamVideo,
  requestWebcamPermission,
  selectWebcamImage,
  setWebcamBackend,
  takeWebcamPhoto,
} from './webcam';

function fakeBackend(): WebcamBackend & { lastOptions: WebcamCaptureOptions | null } {
  return {
    lastOptions: null,
    async capture(options) {
      this.lastOptions = { ...options };
      return { dataUrl: 'data:image/png;base64,xx', width: 0, height: 0, format: 'image/png' };
    },
    async captureVideo(options) {
      this.lastOptions = { ...options };
      return { dataUrl: 'data:video/mp4;base64,xx', duration: 0, format: 'video/mp4' };
    },
    async requestPermission() {
      return true;
    },
  };
}

afterEach(() => setWebcamBackend(null));

describe('createWebWebcamBackend', () => {
  it('returns a backend whose capture yields a Promise without throwing synchronously', () => {
    const backend = createWebWebcamBackend();
    expect(backend.capture({}) instanceof Promise).toBe(true);
  });
});

describe('getWebcamBackend', () => {
  it('falls back to a web backend', () => {
    expect(getWebcamBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setWebcamBackend(backend);
    expect(getWebcamBackend()).toBe(backend);
  });
});

describe('recordWebcamVideo', () => {
  it('captures video with the camera source', async () => {
    const backend = fakeBackend();
    setWebcamBackend(backend);
    const video = await recordWebcamVideo({ maxDurationMs: 5000 });
    expect(video).not.toBeNull();
    expect(backend.lastOptions).toEqual({ maxDurationMs: 5000, source: 'camera' });
  });

  it('returns a Promise from the web backend without throwing', () => {
    const backend = createWebWebcamBackend();
    expect(backend.captureVideo({}) instanceof Promise).toBe(true);
  });
});

describe('requestWebcamPermission', () => {
  it('delegates to the active backend', async () => {
    setWebcamBackend(fakeBackend());
    expect(await requestWebcamPermission()).toBe(true);
  });

  it('returns a boolean from the web backend without throwing', async () => {
    expect(typeof (await requestWebcamPermission())).toBe('boolean');
  });
});

describe('selectWebcamImage', () => {
  it('captures with the photos source', async () => {
    const backend = fakeBackend();
    setWebcamBackend(backend);
    const photo = await selectWebcamImage({ quality: 0.5 });
    expect(photo).not.toBeNull();
    expect(backend.lastOptions).toEqual({ quality: 0.5, source: 'photos' });
  });
});

describe('setWebcamBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setWebcamBackend(fakeBackend());
    setWebcamBackend(null);
    expect(getWebcamBackend()).not.toBeNull();
  });
});

describe('takeWebcamPhoto', () => {
  it('captures with the camera source', async () => {
    const backend = fakeBackend();
    setWebcamBackend(backend);
    const photo = await takeWebcamPhoto({ allowEditing: true });
    expect(photo).not.toBeNull();
    expect(backend.lastOptions).toEqual({ allowEditing: true, source: 'camera' });
  });
});

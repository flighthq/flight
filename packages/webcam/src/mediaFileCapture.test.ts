import type { MediaFileCaptureBackend, MediaFileCaptureOptions } from '@flighthq/types/contract';

import {
  createWebMediaFileCaptureBackend,
  explainMediaFileCaptureBackend,
  getMediaFileCaptureBackend,
  installMediaFileCaptureHostBackend,
  observeMediaFileCaptureHostResult,
  recordMediaFileCaptureVideo,
  resetMediaFileCaptureBackendForTest,
  selectMediaFileCaptureImage,
  setMediaFileCaptureBackend,
  takeMediaFileCapturePhoto,
} from './mediaFileCapture';

function fakeBackend(): MediaFileCaptureBackend & { lastOptions: MediaFileCaptureOptions | null } {
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
  };
}

afterEach(() => setMediaFileCaptureBackend(null));

describe('createWebMediaFileCaptureBackend', () => {
  afterEach(() => vi.restoreAllMocks());

  for (const method of ['capture', 'captureVideo'] as const) {
    it(`${method} settles with null and detaches handlers when the picker is dismissed`, async () => {
      const created: HTMLInputElement[] = [];
      const createElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
        const element = createElement(tag);
        if (tag === 'input') created.push(element as HTMLInputElement);
        return element;
      }) as typeof document.createElement);

      const pending = createWebMediaFileCaptureBackend()[method]({ source: 'photos' });
      created[0].dispatchEvent(new Event('cancel'));

      await expect(
        Promise.race([pending, new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 200))]),
      ).resolves.toBeNull();
      expect(created[0].onchange).toBeNull();
      expect(created[0].oncancel).toBeNull();
    });
  }

  it('returns a backend whose capture yields a Promise without throwing synchronously', () => {
    const backend = createWebMediaFileCaptureBackend();
    expect(backend.capture({}) instanceof Promise).toBe(true);
  });
});

describe('explainMediaFileCaptureBackend', () => {
  afterEach(() => resetMediaFileCaptureBackendForTest());

  it('reports host-not-enabled when no backend is installed', () => {
    resetMediaFileCaptureBackendForTest();
    const explanation = explainMediaFileCaptureBackend();
    expect(explanation.layer).toBe('host-not-enabled');
    expect(explanation.conflict).toBe(false);
    expect(explanation.viability).toBe('unobserved');
  });

  it('reports custom layer when a custom backend is set', () => {
    setMediaFileCaptureBackend(fakeBackend());
    expect(explainMediaFileCaptureBackend().layer).toBe('custom');
  });

  it('reports host layer when a host backend is installed', () => {
    installMediaFileCaptureHostBackend(fakeBackend());
    expect(explainMediaFileCaptureBackend().layer).toBe('host');
  });

  it('reports conflict when two different host backends are installed', () => {
    installMediaFileCaptureHostBackend(fakeBackend());
    installMediaFileCaptureHostBackend(fakeBackend());
    expect(explainMediaFileCaptureBackend().conflict).toBe(true);
  });
});

describe('getMediaFileCaptureBackend', () => {
  it('falls back to a web backend', () => {
    expect(getMediaFileCaptureBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setMediaFileCaptureBackend(backend);
    expect(getMediaFileCaptureBackend()).toBe(backend);
  });
});

describe('installMediaFileCaptureHostBackend', () => {
  afterEach(() => resetMediaFileCaptureBackendForTest());

  it('installs a host backend that getMediaFileCaptureBackend returns', () => {
    const backend = fakeBackend();
    installMediaFileCaptureHostBackend(backend);
    expect(getMediaFileCaptureBackend()).toBe(backend);
  });

  it('is first-host-wins: a second different backend sets conflict', () => {
    const first = fakeBackend();
    const second = fakeBackend();
    installMediaFileCaptureHostBackend(first);
    installMediaFileCaptureHostBackend(second);
    expect(getMediaFileCaptureBackend()).toBe(first);
    expect(explainMediaFileCaptureBackend().conflict).toBe(true);
  });
});

describe('mediaFileCapture public API boundary', () => {
  it('web backend has exactly capture and captureVideo methods', () => {
    const backend = createWebMediaFileCaptureBackend();
    const methods = Object.keys(backend).sort();
    expect(methods).toEqual(['capture', 'captureVideo']);
  });

  it('sentinel backend has no requestPermission method', () => {
    resetMediaFileCaptureBackendForTest();
    setMediaFileCaptureBackend(null);
    const sentinel = getMediaFileCaptureBackend();
    expect('requestPermission' in sentinel).toBe(false);
  });
});

describe('observeMediaFileCaptureHostResult', () => {
  afterEach(() => resetMediaFileCaptureBackendForTest());

  it('records a successful observation', () => {
    installMediaFileCaptureHostBackend(fakeBackend());
    observeMediaFileCaptureHostResult('capture', true);
    const explanation = explainMediaFileCaptureBackend();
    expect(explanation.operation).toBe('capture');
    expect(explanation.viability).toBe('available');
  });

  it('records a failed observation', () => {
    installMediaFileCaptureHostBackend(fakeBackend());
    observeMediaFileCaptureHostResult('capture', false);
    expect(explainMediaFileCaptureBackend().viability).toBe('runtime-api-unavailable');
  });
});

describe('recordMediaFileCaptureVideo', () => {
  it('captures video with the camera source', async () => {
    const backend = fakeBackend();
    setMediaFileCaptureBackend(backend);
    const video = await recordMediaFileCaptureVideo({ maxDurationMs: 5000 });
    expect(video).not.toBeNull();
    expect(backend.lastOptions).toEqual({ maxDurationMs: 5000, source: 'camera' });
  });

  it('returns a Promise from the web backend without throwing', () => {
    const backend = createWebMediaFileCaptureBackend();
    expect(backend.captureVideo({}) instanceof Promise).toBe(true);
  });
});

describe('resetMediaFileCaptureBackendForTest', () => {
  it('clears all backend slots', () => {
    setMediaFileCaptureBackend(fakeBackend());
    installMediaFileCaptureHostBackend(fakeBackend());
    observeMediaFileCaptureHostResult('capture', true);
    resetMediaFileCaptureBackendForTest();
    expect(explainMediaFileCaptureBackend().layer).toBe('host-not-enabled');
    expect(explainMediaFileCaptureBackend().conflict).toBe(false);
    expect(explainMediaFileCaptureBackend().viability).toBe('unobserved');
  });
});

describe('selectMediaFileCaptureImage', () => {
  it('captures with the photos source', async () => {
    const backend = fakeBackend();
    setMediaFileCaptureBackend(backend);
    const photo = await selectMediaFileCaptureImage({ quality: 0.5 });
    expect(photo).not.toBeNull();
    expect(backend.lastOptions).toEqual({ quality: 0.5, source: 'photos' });
  });
});

describe('setMediaFileCaptureBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setMediaFileCaptureBackend(fakeBackend());
    setMediaFileCaptureBackend(null);
    expect(getMediaFileCaptureBackend()).not.toBeNull();
  });
});

describe('takeMediaFileCapturePhoto', () => {
  it('captures with the camera source', async () => {
    const backend = fakeBackend();
    setMediaFileCaptureBackend(backend);
    const photo = await takeMediaFileCapturePhoto({ allowEditing: true });
    expect(photo).not.toBeNull();
    expect(backend.lastOptions).toEqual({ allowEditing: true, source: 'camera' });
  });
});

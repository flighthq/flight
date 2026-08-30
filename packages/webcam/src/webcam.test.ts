import type { WebcamBackend, WebcamCaptureOptions } from '@flighthq/types/contract';

import {
  createWebWebcamBackend,
  getWebcamBackend,
  recordWebcamVideo,
  selectWebcamImage,
  setWebcamBackend,
  takeWebcamPhoto,
  explainWebcamBackend,
  installWebcamHostBackend,
  observeWebcamHostResult,
  resetWebcamBackendForTest,
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
  };
}

afterEach(() => setWebcamBackend(null));

describe('createWebWebcamBackend', () => {
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

      const pending = createWebWebcamBackend()[method]({ source: 'photos' });
      created[0].dispatchEvent(new Event('cancel'));

      await expect(
        Promise.race([pending, new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 200))]),
      ).resolves.toBeNull();
      expect(created[0].onchange).toBeNull();
      expect(created[0].oncancel).toBeNull();
    });
  }

  it('returns a backend whose capture yields a Promise without throwing synchronously', () => {
    const backend = createWebWebcamBackend();
    expect(backend.capture({}) instanceof Promise).toBe(true);
  });
});

describe('explainWebcamBackend', () => {
  afterEach(() => resetWebcamBackendForTest());

  it('reports host-not-enabled when no backend is installed', () => {
    resetWebcamBackendForTest();
    const explanation = explainWebcamBackend();
    expect(explanation.layer).toBe('host-not-enabled');
    expect(explanation.conflict).toBe(false);
    expect(explanation.viability).toBe('unobserved');
  });

  it('reports custom layer when a custom backend is set', () => {
    setWebcamBackend(fakeBackend());
    expect(explainWebcamBackend().layer).toBe('custom');
  });

  it('reports host layer when a host backend is installed', () => {
    installWebcamHostBackend(fakeBackend());
    expect(explainWebcamBackend().layer).toBe('host');
  });

  it('reports conflict when two different host backends are installed', () => {
    installWebcamHostBackend(fakeBackend());
    installWebcamHostBackend(fakeBackend());
    expect(explainWebcamBackend().conflict).toBe(true);
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

describe('installWebcamHostBackend', () => {
  afterEach(() => resetWebcamBackendForTest());

  it('installs a host backend that getWebcamBackend returns', () => {
    const backend = fakeBackend();
    installWebcamHostBackend(backend);
    expect(getWebcamBackend()).toBe(backend);
  });

  it('is first-host-wins: a second different backend sets conflict', () => {
    const first = fakeBackend();
    const second = fakeBackend();
    installWebcamHostBackend(first);
    installWebcamHostBackend(second);
    expect(getWebcamBackend()).toBe(first);
    expect(explainWebcamBackend().conflict).toBe(true);
  });
});

describe('observeWebcamHostResult', () => {
  afterEach(() => resetWebcamBackendForTest());

  it('records a successful observation', () => {
    installWebcamHostBackend(fakeBackend());
    observeWebcamHostResult('capture', true);
    const explanation = explainWebcamBackend();
    expect(explanation.operation).toBe('capture');
    expect(explanation.viability).toBe('available');
  });

  it('records a failed observation', () => {
    installWebcamHostBackend(fakeBackend());
    observeWebcamHostResult('capture', false);
    expect(explainWebcamBackend().viability).toBe('runtime-api-unavailable');
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

describe('resetWebcamBackendForTest', () => {
  it('clears all backend slots', () => {
    setWebcamBackend(fakeBackend());
    installWebcamHostBackend(fakeBackend());
    observeWebcamHostResult('capture', true);
    resetWebcamBackendForTest();
    expect(explainWebcamBackend().layer).toBe('host-not-enabled');
    expect(explainWebcamBackend().conflict).toBe(false);
    expect(explainWebcamBackend().viability).toBe('unobserved');
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

describe('webcam public API boundary', () => {
  it('web backend has exactly capture and captureVideo methods', () => {
    const backend = createWebWebcamBackend();
    const methods = Object.keys(backend).sort();
    expect(methods).toEqual(['capture', 'captureVideo']);
  });

  it('sentinel backend has no requestPermission method', () => {
    resetWebcamBackendForTest();
    setWebcamBackend(null);
    const sentinel = getWebcamBackend();
    expect('requestPermission' in sentinel).toBe(false);
  });
});

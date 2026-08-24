import { connectSignal } from '@flighthq/signals/contract';
import type { ShareBackend, ShareContent, ShareFile, ShareOptions, ShareResult } from '@flighthq/types/contract';

import {
  attachShareSignals,
  canShareContent,
  createWebShareBackend,
  detachShareSignals,
  disposeShareSignals,
  enableShareSignals,
  getShareBackend,
  hasShareContentFields,
  installShareHostBackend,
  isShareAvailable,
  resetShareBackendForTest,
  setShareBackend,
  shareContent,
  shareContentWithResult,
  shareFiles,
  shareText,
  shareUrl,
  explainShareBackend,
  observeShareHostResult,
} from './share';

function fakeBackend(
  overrides: Partial<ShareBackend & { shared: ShareContent | null }> = {},
): ShareBackend & { shared: ShareContent | null } {
  return {
    shared: null,
    isAvailable() {
      return true;
    },
    async share(content) {
      (this as { shared: ShareContent | null }).shared = content;
      return true;
    },
    async shareWithResult(content) {
      (this as { shared: ShareContent | null }).shared = content;
      return { completed: true, activityType: null, dismissed: false };
    },
    canShare() {
      return true;
    },
    ...overrides,
  };
}

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function mockNavigator(value: unknown): void {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true });
}

function restoreNavigator(): void {
  if (originalNavigatorDescriptor !== undefined) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
  } else {
    delete (globalThis as { navigator?: unknown }).navigator;
  }
}

afterEach(() => {
  resetShareBackendForTest();
  restoreNavigator();
});

describe('attachShareSignals', () => {
  it('replaces an existing attachment idempotently', async () => {
    const signals = enableShareSignals();
    attachShareSignals(signals);
    attachShareSignals(signals); // second attach should not double-fire
    let count = 0;
    connectSignal(signals.onShareResult, () => count++);
    setShareBackend(fakeBackend());
    await shareContentWithResult({ text: 'hi' });
    expect(count).toBe(1);
    detachShareSignals(signals);
  });

  it('emits onShareResult when shareContentWithResult is called after attach', async () => {
    const signals = enableShareSignals();
    attachShareSignals(signals);
    const results: ShareResult[] = [];
    connectSignal(signals.onShareResult, (r) => results.push(r));
    setShareBackend(fakeBackend());
    await shareContentWithResult({ text: 'hello' });
    expect(results).toHaveLength(1);
    expect(results[0]!.completed).toBe(true);
    detachShareSignals(signals);
  });

  it('does not emit after detach', async () => {
    const signals = enableShareSignals();
    attachShareSignals(signals);
    detachShareSignals(signals);
    let count = 0;
    connectSignal(signals.onShareResult, () => count++);
    setShareBackend(fakeBackend());
    await shareContentWithResult({ text: 'hi' });
    expect(count).toBe(0);
  });
});

describe('canShareContent', () => {
  it('reflects the backend result', () => {
    setShareBackend(fakeBackend());
    expect(canShareContent({ text: 'x' })).toBe(true);
  });

  it('returns false from the sentinel when no backend is installed', () => {
    expect(canShareContent({ text: 'x' })).toBe(false);
  });

  it('returns false when files cannot be shared', () => {
    setShareBackend({
      isAvailable: () => true,
      canShare: () => false,
      share: async () => false,
      shareWithResult: async () => ({ completed: false, activityType: null, dismissed: false }),
    });
    const file: ShareFile = { name: 'img.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,abc' };
    expect(canShareContent({ files: [file] })).toBe(false);
  });

  it('returns true when files can be shared', () => {
    setShareBackend(fakeBackend());
    const file: ShareFile = { name: 'img.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,abc' };
    expect(canShareContent({ files: [file] })).toBe(true);
  });
});

describe('createWebShareBackend', () => {
  it('returns false for share/canShare and isAvailable=false when the API is absent', async () => {
    const backend = createWebShareBackend();
    expect(backend.isAvailable()).toBe(false);
    expect(await backend.share({ text: 'x' })).toBe(false);
    expect(backend.canShare({ text: 'x' })).toBe(false);
  });

  it('shareWithResult returns completed=false dismissed=false when API is absent', async () => {
    const backend = createWebShareBackend();
    const result = await backend.shareWithResult({ text: 'x' });
    expect(result.completed).toBe(false);
    expect(result.dismissed).toBe(false);
    expect(result.activityType).toBeNull();
  });

  it('shareWithResult returns dismissed=true on AbortError', async () => {
    const backend = createWebShareBackend();
    mockNavigator({
      share: async () => {
        const err = new Error('User aborted');
        err.name = 'AbortError';
        throw err;
      },
      canShare: () => true,
    });
    const result = await backend.shareWithResult({ text: 'hi' });
    expect(result.completed).toBe(false);
    expect(result.dismissed).toBe(true);
  });

  it('shareWithResult returns dismissed=false on non-AbortError', async () => {
    const backend = createWebShareBackend();
    mockNavigator({
      share: async () => {
        const err = new Error('Data error');
        err.name = 'DataError';
        throw err;
      },
      canShare: () => true,
    });
    const result = await backend.shareWithResult({ text: 'hi' });
    expect(result.completed).toBe(false);
    expect(result.dismissed).toBe(false);
  });

  it('isAvailable returns true when navigator.share exists', () => {
    mockNavigator({ share: async () => {} });
    const backend = createWebShareBackend();
    expect(backend.isAvailable()).toBe(true);
  });

  it('canShare delegates files to navigator.canShare', () => {
    let passedData: ShareData | undefined;
    mockNavigator({
      share: async () => {},
      canShare: (data: ShareData) => {
        passedData = data;
        return true;
      },
    });
    const backend = createWebShareBackend();
    const file: ShareFile = { name: 'img.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' };
    backend.canShare({ files: [file] });
    expect(passedData?.files).toHaveLength(1);
    expect(passedData?.files?.[0]).toBeInstanceOf(File);
  });
});

describe('detachShareSignals', () => {
  it('is safe to call when not attached', () => {
    const signals = enableShareSignals();
    expect(() => detachShareSignals(signals)).not.toThrow();
  });
});

describe('disposeShareSignals', () => {
  it('releases signal group without throwing', () => {
    const signals = enableShareSignals();
    attachShareSignals(signals);
    expect(() => disposeShareSignals(signals)).not.toThrow();
  });
});

describe('enableShareSignals', () => {
  it('returns a signals group with onShareResult signal', () => {
    const signals = enableShareSignals();
    expect(signals.onShareResult).toBeDefined();
  });
});

describe('explainShareBackend', () => {
  afterEach(() => resetShareBackendForTest());

  it('reports host-not-enabled when no backend is installed', () => {
    resetShareBackendForTest();
    const explanation = explainShareBackend();
    expect(explanation.layer).toBe('host-not-enabled');
    expect(explanation.conflict).toBe(false);
    expect(explanation.viability).toBe('unobserved');
  });

  it('reports custom layer when a custom backend is set', () => {
    setShareBackend(fakeBackend());
    expect(explainShareBackend().layer).toBe('custom');
  });

  it('reports host layer when a host backend is installed', () => {
    installShareHostBackend(fakeBackend());
    expect(explainShareBackend().layer).toBe('host');
  });

  it('reports conflict when two different host backends are installed', () => {
    installShareHostBackend(fakeBackend());
    installShareHostBackend(fakeBackend());
    expect(explainShareBackend().conflict).toBe(true);
  });
});

describe('getShareBackend', () => {
  it('falls back to the sentinel when no backend is installed', () => {
    expect(getShareBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setShareBackend(backend);
    expect(getShareBackend()).toBe(backend);
  });
});

describe('hasShareContentFields', () => {
  it('returns false for empty object', () => {
    expect(hasShareContentFields({})).toBe(false);
  });

  it('returns false for empty strings', () => {
    expect(hasShareContentFields({ title: '', text: '', url: '' })).toBe(false);
  });

  it('returns false for empty files array', () => {
    expect(hasShareContentFields({ files: [] })).toBe(false);
  });

  it('returns true for non-empty title', () => {
    expect(hasShareContentFields({ title: 'Hello' })).toBe(true);
  });

  it('returns true for non-empty text', () => {
    expect(hasShareContentFields({ text: 'x' })).toBe(true);
  });

  it('returns true for non-empty url', () => {
    expect(hasShareContentFields({ url: 'https://example.com' })).toBe(true);
  });

  it('returns true for non-empty files array', () => {
    const file: ShareFile = { name: 'img.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' };
    expect(hasShareContentFields({ files: [file] })).toBe(true);
  });
});

describe('installShareHostBackend', () => {
  afterEach(() => resetShareBackendForTest());

  it('installs a host backend that getShareBackend returns', () => {
    const backend = fakeBackend();
    installShareHostBackend(backend);
    expect(getShareBackend()).toBe(backend);
  });

  it('is first-host-wins: a second different backend sets conflict', () => {
    const first = fakeBackend();
    const second = fakeBackend();
    installShareHostBackend(first);
    installShareHostBackend(second);
    expect(getShareBackend()).toBe(first);
    expect(explainShareBackend().conflict).toBe(true);
  });
});

describe('isShareAvailable', () => {
  it('returns false from the sentinel when no backend is installed', () => {
    expect(isShareAvailable()).toBe(false);
  });

  it('returns true when the backend reports available', () => {
    setShareBackend(fakeBackend());
    expect(isShareAvailable()).toBe(true);
  });

  it('returns true when the web backend is installed and navigator.share exists', () => {
    mockNavigator({ share: async () => {} });
    installShareHostBackend(createWebShareBackend());
    expect(isShareAvailable()).toBe(true);
  });
});

describe('observeShareHostResult', () => {
  afterEach(() => resetShareBackendForTest());

  it('records a successful observation', () => {
    installShareHostBackend(fakeBackend());
    observeShareHostResult('canShare', true);
    const explanation = explainShareBackend();
    expect(explanation.operation).toBe('canShare');
    expect(explanation.viability).toBe('available');
  });

  it('records a failed observation', () => {
    installShareHostBackend(fakeBackend());
    observeShareHostResult('canShare', false);
    expect(explainShareBackend().viability).toBe('runtime-api-unavailable');
  });
});

describe('resetShareBackendForTest', () => {
  it('clears all backend slots', () => {
    setShareBackend(fakeBackend());
    installShareHostBackend(fakeBackend());
    observeShareHostResult('canShare', true);
    resetShareBackendForTest();
    expect(explainShareBackend().layer).toBe('host-not-enabled');
    expect(explainShareBackend().conflict).toBe(false);
    expect(explainShareBackend().viability).toBe('unobserved');
  });
});

describe('setShareBackend', () => {
  it('clears back to the sentinel when passed null', () => {
    setShareBackend(fakeBackend());
    setShareBackend(null);
    expect(getShareBackend()).not.toBeNull();
  });
});

describe('shareContent', () => {
  it('shares via the active backend', async () => {
    const backend = fakeBackend();
    setShareBackend(backend);
    expect(await shareContent({ title: 't', url: 'u' })).toBe(true);
    expect(backend.shared).toEqual({ title: 't', url: 'u' });
  });

  it('returns false from the sentinel when no backend is installed', async () => {
    expect(await shareContent({ text: 'x' })).toBe(false);
  });

  it('returns false immediately for empty content without calling backend', async () => {
    let called = false;
    setShareBackend({
      isAvailable: () => true,
      canShare: () => false,
      share: async () => {
        called = true;
        return true;
      },
      shareWithResult: async () => ({ completed: true, activityType: null, dismissed: false }),
    });
    expect(await shareContent({})).toBe(false);
    expect(called).toBe(false);
  });

  it('passes options to backend', async () => {
    let passedOptions: ShareOptions | undefined;
    setShareBackend({
      isAvailable: () => true,
      canShare: () => true,
      share: async (_content, options) => {
        passedOptions = options;
        return true;
      },
      shareWithResult: async () => ({ completed: true, activityType: null, dismissed: false }),
    });
    const opts: ShareOptions = { chooserTitle: 'Share via' };
    await shareContent({ text: 'hi' }, opts);
    expect(passedOptions).toEqual(opts);
  });

  it('shares files', async () => {
    const backend = fakeBackend();
    setShareBackend(backend);
    const file: ShareFile = { name: 'img.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' };
    expect(await shareContent({ files: [file] })).toBe(true);
    expect(backend.shared).toEqual({ files: [file] });
  });
});

describe('shareContentWithResult', () => {
  it('returns completed result from backend', async () => {
    setShareBackend(fakeBackend());
    const result = await shareContentWithResult({ text: 'hello' });
    expect(result.completed).toBe(true);
    expect(result.dismissed).toBe(false);
    expect(result.activityType).toBeNull();
  });

  it('returns empty result for empty content without calling backend', async () => {
    let called = false;
    setShareBackend({
      isAvailable: () => true,
      canShare: () => false,
      share: async () => true,
      shareWithResult: async () => {
        called = true;
        return { completed: true, activityType: null, dismissed: false };
      },
    });
    const result = await shareContentWithResult({});
    expect(result.completed).toBe(false);
    expect(called).toBe(false);
  });

  it('emits onShareResult to attached signal groups', async () => {
    setShareBackend(fakeBackend());
    const signals = enableShareSignals();
    attachShareSignals(signals);
    const results: ShareResult[] = [];
    connectSignal(signals.onShareResult, (r) => results.push(r));
    await shareContentWithResult({ url: 'https://example.com' });
    expect(results).toHaveLength(1);
    expect(results[0]!.completed).toBe(true);
    detachShareSignals(signals);
  });

  it('does not emit to detached signal groups', async () => {
    setShareBackend(fakeBackend());
    const signals = enableShareSignals();
    attachShareSignals(signals);
    detachShareSignals(signals);
    let count = 0;
    connectSignal(signals.onShareResult, () => count++);
    await shareContentWithResult({ text: 'hi' });
    expect(count).toBe(0);
  });

  it('passes options to backend', async () => {
    let passedOptions: ShareOptions | undefined;
    setShareBackend({
      isAvailable: () => true,
      canShare: () => true,
      share: async () => true,
      shareWithResult: async (_content, options) => {
        passedOptions = options;
        return { completed: true, activityType: 'com.example.App', dismissed: false };
      },
    });
    const opts: ShareOptions = { excludedActivityTypes: ['com.apple.UIKit.activity.Print'] };
    const result = await shareContentWithResult({ text: 'hi' }, opts);
    expect(passedOptions).toEqual(opts);
    expect(result.activityType).toBe('com.example.App');
  });

  it('returns false from the sentinel when no backend is installed', async () => {
    const result = await shareContentWithResult({ text: 'x' });
    expect(result.completed).toBe(false);
  });
});

describe('shareFiles', () => {
  const file: ShareFile = { dataUrl: 'data:text/plain;base64,aGk=', mimeType: 'text/plain', name: 'hi.txt' };

  it('shares via shareContent with a files payload', async () => {
    const backend = fakeBackend();
    setShareBackend(backend);
    expect(await shareFiles([file])).toBe(true);
    expect(backend.shared).toEqual({ files: [file] });
  });

  it('passes options through', async () => {
    let passedOptions: ShareOptions | undefined;
    setShareBackend({
      isAvailable: () => true,
      canShare: () => true,
      share: async (_content, options) => {
        passedOptions = options;
        return true;
      },
      shareWithResult: async () => ({ completed: true, activityType: null, dismissed: false }),
    });
    const opts: ShareOptions = { chooserTitle: 'Share files' };
    await shareFiles([file], opts);
    expect(passedOptions).toEqual(opts);
  });

  it('resolves false for an empty array without reaching the backend', async () => {
    const backend = fakeBackend();
    setShareBackend(backend);
    expect(await shareFiles([])).toBe(false);
    expect(backend.shared).toBeNull();
  });

  it('carries several files in order', async () => {
    const backend = fakeBackend();
    setShareBackend(backend);
    const second: ShareFile = { dataUrl: 'data:text/plain,two', mimeType: 'text/plain', name: 'two.txt' };
    await shareFiles([file, second]);
    expect(backend.shared?.files).toEqual([file, second]);
  });
});

describe('shareText', () => {
  it('shares via shareContent with text payload', async () => {
    const backend = fakeBackend();
    setShareBackend(backend);
    expect(await shareText('hello world')).toBe(true);
    expect(backend.shared).toEqual({ text: 'hello world' });
  });

  it('passes options to shareContent', async () => {
    let passedOptions: ShareOptions | undefined;
    setShareBackend({
      isAvailable: () => true,
      canShare: () => true,
      share: async (_content, options) => {
        passedOptions = options;
        return true;
      },
      shareWithResult: async () => ({ completed: true, activityType: null, dismissed: false }),
    });
    const opts: ShareOptions = { chooserTitle: 'Share text' };
    await shareText('hi', opts);
    expect(passedOptions).toEqual(opts);
  });
});

describe('shareUrl', () => {
  it('shares via shareContent with url payload', async () => {
    const backend = fakeBackend();
    setShareBackend(backend);
    expect(await shareUrl('https://example.com')).toBe(true);
    expect(backend.shared).toEqual({ url: 'https://example.com' });
  });

  it('passes options to shareContent', async () => {
    let passedOptions: ShareOptions | undefined;
    setShareBackend({
      isAvailable: () => true,
      canShare: () => true,
      share: async (_content, options) => {
        passedOptions = options;
        return true;
      },
      shareWithResult: async () => ({ completed: true, activityType: null, dismissed: false }),
    });
    const opts: ShareOptions = { chooserTitle: 'Share link' };
    await shareUrl('https://example.com', opts);
    expect(passedOptions).toEqual(opts);
  });
});

describe('web backend file conversion', () => {
  it('reports a malformed data URL as unshareable rather than sending the wrong bytes', () => {
    // A dataUrl with no comma used to slip through: indexOf returned -1, so the header read as ''
    // and the body as the whole string, and the converter produced a plausible File containing the
    // URL text. Failing to the ordinary false sentinel is the honest answer.
    mockNavigator({ share: () => Promise.resolve(), canShare: () => true });
    const backend = createWebShareBackend();
    expect(
      backend.canShare({ files: [{ dataUrl: 'data:text/plain;base64', mimeType: 'text/plain', name: 'a.txt' }] }),
    ).toBe(false);
  });

  it('still converts a well-formed data URL', () => {
    mockNavigator({ share: () => Promise.resolve(), canShare: () => true });
    const backend = createWebShareBackend();
    expect(
      backend.canShare({ files: [{ dataUrl: 'data:text/plain;base64,aGk=', mimeType: 'text/plain', name: 'a.txt' }] }),
    ).toBe(true);
  });

  it('rejects a malformed data URL on the share path too, not only the probe', async () => {
    mockNavigator({ share: () => Promise.resolve(), canShare: () => true });
    const backend = createWebShareBackend();
    expect(await backend.share({ files: [{ dataUrl: 'nope', mimeType: 'text/plain', name: 'a.txt' }] })).toBe(false);
  });
});

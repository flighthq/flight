import type { ShareBackend, ShareContent } from '@flighthq/types';

import { canShareContent, createWebShareBackend, getShareBackend, setShareBackend, shareContent } from './share';

function fakeBackend(): ShareBackend & { shared: ShareContent | null } {
  return {
    shared: null,
    async share(content) {
      this.shared = content;
      return true;
    },
    canShare() {
      return true;
    },
  };
}

afterEach(() => setShareBackend(null));

describe('canShareContent', () => {
  it('reflects the backend result', () => {
    setShareBackend(fakeBackend());
    expect(canShareContent({ text: 'x' })).toBe(true);
  });

  it('returns false from the web backend in jsdom without throwing', () => {
    expect(canShareContent({ text: 'x' })).toBe(false);
  });
});

describe('createWebShareBackend', () => {
  it('returns false for share/canShare when the API is absent', async () => {
    const backend = createWebShareBackend();
    expect(await backend.share({ text: 'x' })).toBe(false);
    expect(backend.canShare({ text: 'x' })).toBe(false);
  });
});

describe('getShareBackend', () => {
  it('falls back to a web backend', () => {
    expect(getShareBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setShareBackend(backend);
    expect(getShareBackend()).toBe(backend);
  });
});

describe('setShareBackend', () => {
  it('clears back to the web fallback when passed null', () => {
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

  it('returns false from the web backend in jsdom without throwing', async () => {
    expect(await shareContent({ text: 'x' })).toBe(false);
  });
});

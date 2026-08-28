import type { FontLoadingBackend } from '@flighthq/types/contract';

import {
  explainFontLoadingBackend,
  getFontLoadingBackend,
  hasFontLoadingHostBackend,
  installFontLoadingHostBackend,
  resetFontLoadingBackendForTest,
  setFontLoadingBackend,
} from './fontLoading';

afterEach(() => {
  resetFontLoadingBackendForTest();
});

function createMockBackend(overrides: Partial<FontLoadingBackend> = {}): FontLoadingBackend {
  return {
    addFontFace: vi.fn(),
    checkFontFace: vi.fn().mockReturnValue(true),
    loadFontFaces: vi.fn().mockResolvedValue([]),
    whenReady: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('explainFontLoadingBackend', () => {
  it('reports host-not-enabled when no backend is installed', () => {
    expect(explainFontLoadingBackend()).toEqual({
      conflict: false,
      layer: 'host-not-enabled',
      operation: null,
      viability: 'unobserved',
    });
  });

  it('reports host when a host backend is installed', () => {
    installFontLoadingHostBackend(createMockBackend());
    expect(explainFontLoadingBackend()).toEqual({
      conflict: false,
      layer: 'host',
      operation: null,
      viability: 'unobserved',
    });
  });

  it('reports custom when a custom backend is set', () => {
    setFontLoadingBackend(createMockBackend());
    expect(explainFontLoadingBackend()).toEqual({
      conflict: false,
      layer: 'custom',
      operation: null,
      viability: 'unobserved',
    });
  });

  it('reports custom over host when both are installed', () => {
    installFontLoadingHostBackend(createMockBackend());
    setFontLoadingBackend(createMockBackend());
    expect(explainFontLoadingBackend().layer).toBe('custom');
  });

  it('reports conflict when a different host backend is installed twice', () => {
    installFontLoadingHostBackend(createMockBackend());
    installFontLoadingHostBackend(createMockBackend());
    expect(explainFontLoadingBackend().conflict).toBe(true);
  });
});

describe('getFontLoadingBackend', () => {
  it('returns the sentinel when no backend is installed', () => {
    const backend = getFontLoadingBackend();
    expect(backend.checkFontFace('1em serif')).toBe(false);
  });

  it('returns the host backend when installed', () => {
    const host = createMockBackend();
    installFontLoadingHostBackend(host);
    expect(getFontLoadingBackend()).toBe(host);
  });

  it('returns the custom backend when set', () => {
    const custom = createMockBackend();
    setFontLoadingBackend(custom);
    expect(getFontLoadingBackend()).toBe(custom);
  });

  it('prefers custom over host', () => {
    const host = createMockBackend();
    const custom = createMockBackend();
    installFontLoadingHostBackend(host);
    setFontLoadingBackend(custom);
    expect(getFontLoadingBackend()).toBe(custom);
  });

  it('reveals host when custom is cleared', () => {
    const host = createMockBackend();
    installFontLoadingHostBackend(host);
    setFontLoadingBackend(createMockBackend());
    setFontLoadingBackend(null);
    expect(getFontLoadingBackend()).toBe(host);
  });
});

describe('hasFontLoadingHostBackend', () => {
  it('returns false when no host is installed', () => {
    expect(hasFontLoadingHostBackend()).toBe(false);
  });

  it('returns true after installing a host backend', () => {
    installFontLoadingHostBackend(createMockBackend());
    expect(hasFontLoadingHostBackend()).toBe(true);
  });
});

describe('installFontLoadingHostBackend', () => {
  it('ignores a second install of the same instance', () => {
    const host = createMockBackend();
    installFontLoadingHostBackend(host);
    installFontLoadingHostBackend(host);
    expect(explainFontLoadingBackend().conflict).toBe(false);
  });
});

describe('resetFontLoadingBackendForTest', () => {
  it('clears all backend state', () => {
    installFontLoadingHostBackend(createMockBackend());
    setFontLoadingBackend(createMockBackend());
    resetFontLoadingBackendForTest();
    expect(hasFontLoadingHostBackend()).toBe(false);
    expect(explainFontLoadingBackend().layer).toBe('host-not-enabled');
  });
});

describe('sentinel', () => {
  it('addFontFace is a no-op', () => {
    const backend = getFontLoadingBackend();
    expect(() => backend.addFontFace({} as FontFace)).not.toThrow();
  });

  it('checkFontFace returns false', () => {
    expect(getFontLoadingBackend().checkFontFace('1em serif')).toBe(false);
  });

  it('loadFontFaces resolves to an empty array', async () => {
    await expect(getFontLoadingBackend().loadFontFaces('1em serif')).resolves.toEqual([]);
  });

  it('whenReady resolves', async () => {
    await expect(getFontLoadingBackend().whenReady()).resolves.toBeUndefined();
  });
});

describe('setFontLoadingBackend', () => {
  it('sets a custom backend', () => {
    const custom = createMockBackend();
    setFontLoadingBackend(custom);
    expect(getFontLoadingBackend()).toBe(custom);
  });

  it('clears the custom backend with null', () => {
    setFontLoadingBackend(createMockBackend());
    setFontLoadingBackend(null);
    expect(getFontLoadingBackend().checkFontFace('1em serif')).toBe(false);
  });
});

import type { PlatformBackend, PlatformInfo } from '@flighthq/types';

import {
  comparePlatformVersions,
  createPlatformInfo,
  createWebPlatformBackend,
  getPlatformBackend,
  getPlatformEngine,
  getPlatformInfo,
  getPlatformKind,
  getPlatformName,
  getPlatformRuntime,
  isPlatformDesktop,
  isPlatformMobile,
  isPlatformNative,
  isPlatformTouch,
  isPlatformVersionAtLeast,
  isPlatformWeb,
  setPlatformBackend,
} from './platform';

function fakeBackend(info: Partial<PlatformInfo>): PlatformBackend {
  return {
    getInfo(out) {
      Object.assign(out, createPlatformInfo(), info);
      return out;
    },
  };
}

afterEach(() => setPlatformBackend(null));

describe('comparePlatformVersions', () => {
  it('returns 0 for identical strings', () => {
    expect(comparePlatformVersions('10.15.7', '10.15.7')).toBe(0);
  });

  it('returns 0 for two empty strings', () => {
    expect(comparePlatformVersions('', '')).toBe(0);
  });

  it('empty string sorts lower than any version', () => {
    expect(comparePlatformVersions('', '1.0')).toBe(-1);
    expect(comparePlatformVersions('1.0', '')).toBe(1);
  });

  it('returns -1 when a is lower', () => {
    expect(comparePlatformVersions('10.15.6', '10.15.7')).toBe(-1);
    expect(comparePlatformVersions('9', '10')).toBe(-1);
    expect(comparePlatformVersions('10.0', '10.0.1')).toBe(-1);
  });

  it('returns 1 when a is higher', () => {
    expect(comparePlatformVersions('10.15.7', '10.15.6')).toBe(1);
    expect(comparePlatformVersions('11', '10')).toBe(1);
    expect(comparePlatformVersions('14', '13.0.1')).toBe(1);
  });

  it('compares numeric segments, not lexicographic', () => {
    expect(comparePlatformVersions('10', '9')).toBe(1);
    expect(comparePlatformVersions('2.10', '2.9')).toBe(1);
  });

  it('treats missing trailing segments as 0', () => {
    expect(comparePlatformVersions('10.0', '10.0.0')).toBe(0);
    expect(comparePlatformVersions('10', '10.0.0')).toBe(0);
  });
});

describe('createPlatformInfo', () => {
  it('allocates a zeroed PlatformInfo with all new fields', () => {
    expect(createPlatformInfo()).toEqual({
      arch: '',
      distro: '',
      distroVersion: '',
      endianness: 'unknown',
      engine: 'unknown',
      engineVersion: '',
      isTouch: false,
      kind: 'unknown',
      locale: '',
      name: 'unknown',
      osBuild: '',
      pointerWidth: -1,
      runtime: 'unknown',
      version: '',
    });
  });
});

describe('createWebPlatformBackend', () => {
  it('produces a backend that fills the out info', () => {
    const out = createPlatformInfo();
    const result = createWebPlatformBackend().getInfo(out);
    expect(result).toBe(out);
    expect(typeof result.name).toBe('string');
  });

  it('sets engine to a known canonical value', () => {
    const out = createPlatformInfo();
    createWebPlatformBackend().getInfo(out);
    expect(['blink', 'gecko', 'webkit', 'unknown']).toContain(out.engine);
  });

  it('sets runtime to a known canonical value', () => {
    const out = createPlatformInfo();
    createWebPlatformBackend().getInfo(out);
    expect(['web', 'electron', 'tauri', 'capacitor', 'native', 'unknown']).toContain(out.runtime);
  });

  it('sets kind to a known canonical value', () => {
    const out = createPlatformInfo();
    createWebPlatformBackend().getInfo(out);
    expect(['desktop', 'mobile', 'web', 'unknown']).toContain(out.kind);
  });

  it('sets name to a known canonical value', () => {
    const out = createPlatformInfo();
    createWebPlatformBackend().getInfo(out);
    expect(['web', 'windows', 'macos', 'linux', 'ios', 'android', 'unknown']).toContain(out.name);
  });

  it('sets endianness to a known canonical value', () => {
    const out = createPlatformInfo();
    createWebPlatformBackend().getInfo(out);
    expect(['little', 'big', 'unknown']).toContain(out.endianness);
  });

  it('sets pointerWidth to a known canonical value', () => {
    const out = createPlatformInfo();
    createWebPlatformBackend().getInfo(out);
    expect([-1, 32, 64]).toContain(out.pointerWidth);
  });

  it('sets osBuild, distro, distroVersion to empty string on web', () => {
    const out = createPlatformInfo();
    createWebPlatformBackend().getInfo(out);
    expect(out.osBuild).toBe('');
    expect(out.distro).toBe('');
    expect(out.distroVersion).toBe('');
  });
});

describe('getPlatformBackend', () => {
  it('falls back to a web backend when none is registered', () => {
    expect(getPlatformBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend({ kind: 'desktop', name: 'windows' });
    setPlatformBackend(backend);
    expect(getPlatformBackend()).toBe(backend);
  });
});

describe('getPlatformEngine', () => {
  it('returns the engine from the active backend', () => {
    setPlatformBackend(fakeBackend({ engine: 'blink' }));
    expect(getPlatformEngine()).toBe('blink');
  });

  it('returns gecko when set', () => {
    setPlatformBackend(fakeBackend({ engine: 'gecko' }));
    expect(getPlatformEngine()).toBe('gecko');
  });

  it('returns webkit when set', () => {
    setPlatformBackend(fakeBackend({ engine: 'webkit' }));
    expect(getPlatformEngine()).toBe('webkit');
  });

  it('returns unknown for native backends', () => {
    setPlatformBackend(fakeBackend({ engine: 'unknown' }));
    expect(getPlatformEngine()).toBe('unknown');
  });
});

describe('getPlatformInfo', () => {
  it('fills and returns the out parameter', () => {
    setPlatformBackend(fakeBackend({ arch: 'arm64', kind: 'mobile', name: 'ios' }));
    const out = createPlatformInfo();
    expect(getPlatformInfo(out)).toBe(out);
    expect(out.name).toBe('ios');
    expect(out.arch).toBe('arm64');
  });
});

describe('getPlatformKind', () => {
  it('returns the active backend kind', () => {
    setPlatformBackend(fakeBackend({ kind: 'desktop' }));
    expect(getPlatformKind()).toBe('desktop');
  });
});

describe('getPlatformName', () => {
  it('returns the active backend name', () => {
    setPlatformBackend(fakeBackend({ name: 'macos' }));
    expect(getPlatformName()).toBe('macos');
  });
});

describe('getPlatformRuntime', () => {
  it('returns web when no host shell is detected', () => {
    setPlatformBackend(fakeBackend({ runtime: 'web' }));
    expect(getPlatformRuntime()).toBe('web');
  });

  it('returns electron when set', () => {
    setPlatformBackend(fakeBackend({ runtime: 'electron' }));
    expect(getPlatformRuntime()).toBe('electron');
  });

  it('returns tauri when set', () => {
    setPlatformBackend(fakeBackend({ runtime: 'tauri' }));
    expect(getPlatformRuntime()).toBe('tauri');
  });

  it('returns capacitor when set', () => {
    setPlatformBackend(fakeBackend({ runtime: 'capacitor' }));
    expect(getPlatformRuntime()).toBe('capacitor');
  });

  it('returns native when set by a native backend', () => {
    setPlatformBackend(fakeBackend({ runtime: 'native' }));
    expect(getPlatformRuntime()).toBe('native');
  });
});

describe('isPlatformDesktop', () => {
  it('is true only for desktop kind', () => {
    setPlatformBackend(fakeBackend({ kind: 'desktop' }));
    expect(isPlatformDesktop()).toBe(true);
    setPlatformBackend(fakeBackend({ kind: 'web' }));
    expect(isPlatformDesktop()).toBe(false);
  });
});

describe('isPlatformMobile', () => {
  it('is true only for mobile kind', () => {
    setPlatformBackend(fakeBackend({ kind: 'mobile' }));
    expect(isPlatformMobile()).toBe(true);
  });
});

describe('isPlatformNative', () => {
  it('is true for electron runtime', () => {
    setPlatformBackend(fakeBackend({ runtime: 'electron' }));
    expect(isPlatformNative()).toBe(true);
  });

  it('is true for tauri runtime', () => {
    setPlatformBackend(fakeBackend({ runtime: 'tauri' }));
    expect(isPlatformNative()).toBe(true);
  });

  it('is true for capacitor runtime', () => {
    setPlatformBackend(fakeBackend({ runtime: 'capacitor' }));
    expect(isPlatformNative()).toBe(true);
  });

  it('is true for native runtime', () => {
    setPlatformBackend(fakeBackend({ runtime: 'native' }));
    expect(isPlatformNative()).toBe(true);
  });

  it('is false for web runtime', () => {
    setPlatformBackend(fakeBackend({ runtime: 'web' }));
    expect(isPlatformNative()).toBe(false);
  });

  it('is false for unknown runtime', () => {
    setPlatformBackend(fakeBackend({ runtime: 'unknown' }));
    expect(isPlatformNative()).toBe(false);
  });
});

describe('isPlatformTouch', () => {
  it('reflects the backend isTouch flag', () => {
    setPlatformBackend(fakeBackend({ isTouch: true }));
    expect(isPlatformTouch()).toBe(true);
  });
});

describe('isPlatformVersionAtLeast', () => {
  it('is true when version equals minimum', () => {
    setPlatformBackend(fakeBackend({ version: '14.0' }));
    expect(isPlatformVersionAtLeast('14.0')).toBe(true);
  });

  it('is true when version exceeds minimum', () => {
    setPlatformBackend(fakeBackend({ version: '15.0' }));
    expect(isPlatformVersionAtLeast('14.0')).toBe(true);
  });

  it('is false when version is below minimum', () => {
    setPlatformBackend(fakeBackend({ version: '13.0' }));
    expect(isPlatformVersionAtLeast('14.0')).toBe(false);
  });

  it('is false when version is empty (unknown)', () => {
    setPlatformBackend(fakeBackend({ version: '' }));
    expect(isPlatformVersionAtLeast('1.0')).toBe(false);
  });

  it('handles patch-level comparison', () => {
    setPlatformBackend(fakeBackend({ version: '10.15.7' }));
    expect(isPlatformVersionAtLeast('10.15.6')).toBe(true);
    expect(isPlatformVersionAtLeast('10.15.7')).toBe(true);
    expect(isPlatformVersionAtLeast('10.15.8')).toBe(false);
  });
});

describe('isPlatformWeb', () => {
  it('is true only for web kind', () => {
    setPlatformBackend(fakeBackend({ kind: 'web' }));
    expect(isPlatformWeb()).toBe(true);
  });
});

describe('setPlatformBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setPlatformBackend(fakeBackend({ name: 'linux' }));
    setPlatformBackend(null);
    expect(getPlatformBackend()).not.toBeNull();
  });
});

// Web backend UA-detection tests — use the internal createWebPlatformBackend to exercise detection
// heuristics under controlled UA strings. These run in jsdom which may have its own navigator.
describe('web backend UA detection', () => {
  // Helper: temporarily replace navigator.userAgent for a block (jsdom only).
  function withUserAgent(ua: string, fn: () => void): void {
    const original = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua });
    try {
      fn();
    } finally {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: original });
    }
  }

  describe('arch detection', () => {
    it('detects arm64 from aarch64', () => {
      withUserAgent('Mozilla/5.0 (Linux; aarch64) AppleWebKit/537.36', () => {
        const out = createPlatformInfo();
        createWebPlatformBackend().getInfo(out);
        expect(out.arch).toBe('arm64');
      });
    });

    it('detects arm64 from arm64 token', () => {
      withUserAgent('Mozilla/5.0 (iPhone; CPU arm64)', () => {
        const out = createPlatformInfo();
        createWebPlatformBackend().getInfo(out);
        expect(out.arch).toBe('arm64');
      });
    });

    it('detects x64 from Win64', () => {
      withUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', () => {
        const out = createPlatformInfo();
        createWebPlatformBackend().getInfo(out);
        expect(out.arch).toBe('x64');
      });
    });

    it('detects x64 from WOW64', () => {
      withUserAgent('Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36', () => {
        const out = createPlatformInfo();
        createWebPlatformBackend().getInfo(out);
        expect(out.arch).toBe('x64');
      });
    });

    it('returns empty string when arch is undetectable', () => {
      withUserAgent('Mozilla/5.0 (X11; Linux) AppleWebKit/537.36', () => {
        const out = createPlatformInfo();
        createWebPlatformBackend().getInfo(out);
        expect(out.arch).toBe('');
      });
    });
  });

  describe('canonical token normalization', () => {
    const KNOWN_NAMES = ['web', 'windows', 'macos', 'linux', 'ios', 'android', 'unknown'];
    const KNOWN_KINDS = ['desktop', 'mobile', 'web', 'unknown'];
    const KNOWN_RUNTIMES = ['web', 'electron', 'tauri', 'capacitor', 'native', 'unknown'];
    const KNOWN_ENGINES = ['blink', 'gecko', 'webkit', 'unknown'];
    const KNOWN_ENDIANNESSES = ['little', 'big', 'unknown'];
    const KNOWN_POINTER_WIDTHS = [-1, 32, 64];

    const TEST_UAS = [
      // Windows Chrome
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      // macOS Safari
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
      // Firefox
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
      // iOS Safari
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15',
      // Android Chrome
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    ];

    for (const ua of TEST_UAS) {
      it(`only emits known canonical tokens for UA: ${ua.slice(0, 60)}…`, () => {
        withUserAgent(ua, () => {
          const out = createPlatformInfo();
          createWebPlatformBackend().getInfo(out);
          expect(KNOWN_NAMES).toContain(out.name);
          expect(KNOWN_KINDS).toContain(out.kind);
          expect(KNOWN_RUNTIMES).toContain(out.runtime);
          expect(KNOWN_ENGINES).toContain(out.engine);
          expect(KNOWN_ENDIANNESSES).toContain(out.endianness);
          expect(KNOWN_POINTER_WIDTHS).toContain(out.pointerWidth);
          expect(typeof out.version).toBe('string');
          expect(typeof out.engineVersion).toBe('string');
          expect(typeof out.arch).toBe('string');
        });
      });
    }
  });

  describe('endianness detection', () => {
    it('returns a known canonical value', () => {
      const out = createPlatformInfo();
      createWebPlatformBackend().getInfo(out);
      expect(['little', 'big', 'unknown']).toContain(out.endianness);
    });

    it('returns little on jsdom (x64 host)', () => {
      // jsdom runs on Node.js on x64 hardware — always little-endian.
      const out = createPlatformInfo();
      createWebPlatformBackend().getInfo(out);
      expect(out.endianness).toBe('little');
    });
  });

  describe('engine detection', () => {
    it('detects blink from Chrome UA', () => {
      withUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        () => {
          const out = createPlatformInfo();
          createWebPlatformBackend().getInfo(out);
          expect(out.engine).toBe('blink');
        },
      );
    });

    it('detects gecko from Firefox UA', () => {
      withUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0', () => {
        const out = createPlatformInfo();
        createWebPlatformBackend().getInfo(out);
        expect(out.engine).toBe('gecko');
      });
    });

    it('detects webkit from Safari UA', () => {
      withUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
        () => {
          const out = createPlatformInfo();
          createWebPlatformBackend().getInfo(out);
          expect(out.engine).toBe('webkit');
        },
      );
    });
  });

  describe('engineVersion detection', () => {
    it('extracts Firefox version', () => {
      withUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0', () => {
        const out = createPlatformInfo();
        createWebPlatformBackend().getInfo(out);
        expect(out.engineVersion).toBe('120.0');
      });
    });

    it('extracts Chrome version', () => {
      withUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.109 Safari/537.36',
        () => {
          const out = createPlatformInfo();
          createWebPlatformBackend().getInfo(out);
          expect(out.engineVersion).toBe('120.0.6099.109');
        },
      );
    });

    it('extracts Edge version (Edg/ token)', () => {
      withUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.133',
        () => {
          const out = createPlatformInfo();
          createWebPlatformBackend().getInfo(out);
          expect(out.engineVersion).toBe('120.0.2210.133');
        },
      );
    });

    it('extracts Safari version from Version/ token', () => {
      withUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
        () => {
          const out = createPlatformInfo();
          createWebPlatformBackend().getInfo(out);
          expect(out.engineVersion).toBe('16.0');
        },
      );
    });
  });

  describe('pointerWidth detection', () => {
    it('returns 64 for x64 arch', () => {
      withUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', () => {
        const out = createPlatformInfo();
        createWebPlatformBackend().getInfo(out);
        expect(out.pointerWidth).toBe(64);
      });
    });

    it('returns 64 for arm64 arch', () => {
      withUserAgent('Mozilla/5.0 (Linux; aarch64) AppleWebKit/537.36', () => {
        const out = createPlatformInfo();
        createWebPlatformBackend().getInfo(out);
        expect(out.pointerWidth).toBe(64);
      });
    });

    it('returns -1 when arch is undetectable', () => {
      withUserAgent('Mozilla/5.0 (X11; Linux) AppleWebKit/537.36', () => {
        const out = createPlatformInfo();
        createWebPlatformBackend().getInfo(out);
        expect(out.pointerWidth).toBe(-1);
      });
    });
  });

  describe('version detection', () => {
    it('parses Windows version from NT string', () => {
      withUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', () => {
        const out = createPlatformInfo();
        createWebPlatformBackend().getInfo(out);
        expect(out.version).toBe('10.0');
      });
    });

    it('parses macOS version with underscore separators', () => {
      withUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', () => {
        const out = createPlatformInfo();
        createWebPlatformBackend().getInfo(out);
        expect(out.version).toBe('10.15.7');
      });
    });

    it('parses iOS version', () => {
      withUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)', () => {
        const out = createPlatformInfo();
        createWebPlatformBackend().getInfo(out);
        expect(out.version).toBe('17.4.1');
      });
    });

    it('parses Android version', () => {
      withUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36', () => {
        const out = createPlatformInfo();
        createWebPlatformBackend().getInfo(out);
        expect(out.version).toBe('14');
      });
    });

    it('returns empty string when version is undetectable', () => {
      withUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36', () => {
        const out = createPlatformInfo();
        createWebPlatformBackend().getInfo(out);
        expect(out.version).toBe('');
      });
    });
  });
});

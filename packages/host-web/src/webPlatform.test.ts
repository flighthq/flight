import { createPlatformInfo } from '@flighthq/platform/contract';

import { createWebPlatformBackend, webPlatformBackend } from './webPlatform';

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

describe('web backend UA detection', () => {
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
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15',
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

describe('webPlatformBackend', () => {
  it('is a pre-constructed singleton', () => {
    expect(webPlatformBackend).toBeDefined();
    expect(typeof webPlatformBackend.getInfo).toBe('function');
  });

  it('fills info identically to a fresh factory instance', () => {
    const a = createPlatformInfo();
    const b = createPlatformInfo();
    webPlatformBackend.getInfo(a);
    createWebPlatformBackend().getInfo(b);
    expect(a).toEqual(b);
  });
});

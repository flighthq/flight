import type { PlatformName } from '@flighthq/types/contract';

import {
  detectEndianness,
  parseUserAgentArch,
  parseUserAgentEngine,
  parseUserAgentEngineVersion,
  parseUserAgentKind,
  parseUserAgentName,
  parseUserAgentPointerWidth,
  parseUserAgentRuntime,
  parseUserAgentVersion,
} from './userAgent';
import { parseUserAgentOsVersion } from './userAgentParse';

describe('detectEndianness', () => {
  it('returns a known canonical value', () => {
    expect(['little', 'big', 'unknown']).toContain(detectEndianness());
  });

  it('returns little on Node.js (x64 host)', () => {
    // Node.js always runs on x64/arm64 hardware which is little-endian.
    expect(detectEndianness()).toBe('little');
  });
});

describe('parseUserAgentArch', () => {
  it('detects arm64 from aarch64 token', () => {
    expect(parseUserAgentArch('Mozilla/5.0 (Linux; aarch64) AppleWebKit/537.36')).toBe('arm64');
  });

  it('detects arm64 from arm64 token', () => {
    expect(parseUserAgentArch('Mozilla/5.0 (iPhone; CPU arm64)')).toBe('arm64');
  });

  it('detects x64 from Win64 token', () => {
    expect(parseUserAgentArch('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBe('x64');
  });

  it('detects x64 from WOW64 token', () => {
    expect(parseUserAgentArch('Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36')).toBe('x64');
  });

  it('detects x64 from x86_64 token', () => {
    expect(parseUserAgentArch('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36')).toBe('x64');
  });

  it('detects x86 from i686 token', () => {
    expect(parseUserAgentArch('Mozilla/5.0 (X11; Linux i686; rv:109.0)')).toBe('x86');
  });

  it('detects arm before arm64 does not fire on plain arm token', () => {
    // A UA with only 'arm' (not 'arm64'/'aarch64') should yield 'arm'.
    expect(parseUserAgentArch('Mozilla/5.0 (Linux; armv7l)')).toBe('arm');
  });

  it('detects riscv64, mips64, and mips tokens', () => {
    expect(parseUserAgentArch('Mozilla/5.0 (Linux; riscv64)')).toBe('riscv64');
    expect(parseUserAgentArch('Mozilla/5.0 (Linux; mips64)')).toBe('mips64');
    expect(parseUserAgentArch('Mozilla/5.0 (Linux; mips)')).toBe('mips');
  });

  it('prefers the UA-CH platform hint over the UA string', () => {
    expect(parseUserAgentArch('', 'arm')).toBe('arm64');
    expect(parseUserAgentArch('', 'Windows')).toBe('x64');
    expect(parseUserAgentArch('', 'macOS')).toBe('x64');
    expect(parseUserAgentArch('', 'Linux')).toBe('x64');
    expect(parseUserAgentArch('', 'Chrome OS')).toBe('x64');
  });

  it('falls back to the UA string when the platform hint is inconclusive', () => {
    expect(parseUserAgentArch('Mozilla/5.0 (X11; Linux x86_64)', 'SomeCustomPlatform')).toBe('x64');
  });

  it('returns empty string when arch is undetectable', () => {
    expect(parseUserAgentArch('Mozilla/5.0 (X11; Linux) AppleWebKit/537.36')).toBe('');
    expect(parseUserAgentArch('SomeCustomBrowser/1.0')).toBe('');
  });
});

describe('parseUserAgentEngine', () => {
  it('returns gecko for Firefox', () => {
    expect(
      parseUserAgentEngine('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0'),
    ).toBe('gecko');
  });

  it('returns blink for Chrome', () => {
    expect(
      parseUserAgentEngine(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('blink');
  });

  it('returns blink for Edge (Edg/)', () => {
    expect(
      parseUserAgentEngine(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.133',
      ),
    ).toBe('blink');
  });

  it('returns webkit for Safari', () => {
    expect(
      parseUserAgentEngine(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
      ),
    ).toBe('webkit');
  });

  it('returns unknown for unrecognized UA', () => {
    expect(parseUserAgentEngine('')).toBe('unknown');
    expect(parseUserAgentEngine('CustomBot/1.0')).toBe('unknown');
  });
});

describe('parseUserAgentEngine for Opera on iOS', () => {
  const IOS_PREFIX = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ';

  it.each([
    ['OPiOS', `${IOS_PREFIX}(KHTML, like Gecko) OPiOS/9.2.0.11256 Mobile/15E148 Safari/9537.53`],
    ['OPT', `${IOS_PREFIX}(KHTML, like Gecko) Version/17.0 OPT/3.6.1 Mobile/15E148 Safari/604.1`],
  ])('keeps the %s product token on WebKit', (_token, ua) => {
    const engine = parseUserAgentEngine(ua);
    expect(engine).toBe('webkit');
    expect(parseUserAgentEngineVersion(ua, engine)).not.toBe('');
  });
});

describe('parseUserAgentEngine on iOS', () => {
  // Every browser on iOS/iPadOS runs on the system WebKit, whatever product token it advertises.
  // Deciding the engine from the product token got EdgiOS wrong — it contains `edg`, so it was
  // reported as blink, and then no `Edg/` token followed so the version came back empty.
  const IOS_PREFIX = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ';

  it('reports webkit for Edge on iOS, which contains the blink-family token "edg"', () => {
    const ua = `${IOS_PREFIX}EdgiOS/120.0.0.0 Mobile/15E148 Safari/605.1.15`;
    expect(parseUserAgentEngine(ua)).toBe('webkit');
    expect(parseUserAgentEngineVersion(ua, 'webkit')).not.toBe('');
  });

  it('reports webkit for Chrome and Firefox on iOS', () => {
    expect(parseUserAgentEngine(`${IOS_PREFIX}CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1`)).toBe('webkit');
    expect(parseUserAgentEngine(`${IOS_PREFIX}FxiOS/121.0 Mobile/15E148 Safari/605.1.15`)).toBe('webkit');
  });

  it('reports webkit for an iPad UA', () => {
    const ua =
      'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1';
    expect(parseUserAgentEngine(ua)).toBe('webkit');
  });

  it('still reports blink for desktop Chrome and Edge, which are not on iOS', () => {
    const mac =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const win =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
    expect(parseUserAgentEngine(mac)).toBe('blink');
    expect(parseUserAgentEngine(win)).toBe('blink');
    expect(parseUserAgentEngineVersion(win, 'blink')).toBe('120.0.0.0');
  });

  it('still reports gecko for desktop Firefox', () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0';
    expect(parseUserAgentEngine(ua)).toBe('gecko');
  });
});

describe('parseUserAgentEngineVersion', () => {
  it('extracts Firefox version', () => {
    expect(
      parseUserAgentEngineVersion(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
        'gecko',
      ),
    ).toBe('120.0');
  });

  it('extracts Chrome version', () => {
    expect(
      parseUserAgentEngineVersion(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.109 Safari/537.36',
        'blink',
      ),
    ).toBe('120.0.6099.109');
  });

  it('extracts Edge version (Edg/ token takes priority over Chrome/)', () => {
    expect(
      parseUserAgentEngineVersion(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.133',
        'blink',
      ),
    ).toBe('120.0.2210.133');
  });

  it('extracts Safari Version/ token', () => {
    expect(
      parseUserAgentEngineVersion(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
        'webkit',
      ),
    ).toBe('16.0');
  });

  it('returns empty string for unknown engine', () => {
    expect(parseUserAgentEngineVersion('any UA string', 'unknown')).toBe('');
  });

  it('returns empty string when version is absent', () => {
    expect(parseUserAgentEngineVersion('', 'gecko')).toBe('');
  });
});

describe('parseUserAgentKind', () => {
  it('returns mobile for ios', () => {
    expect(parseUserAgentKind('ios')).toBe('mobile');
  });

  it('returns mobile for android', () => {
    expect(parseUserAgentKind('android')).toBe('mobile');
  });

  it('returns web for desktop names', () => {
    expect(parseUserAgentKind('windows')).toBe('web');
    expect(parseUserAgentKind('macos')).toBe('web');
    expect(parseUserAgentKind('linux')).toBe('web');
  });

  it('returns web for unknown', () => {
    expect(parseUserAgentKind('unknown')).toBe('web');
  });
});

describe('parseUserAgentName', () => {
  it('detects android', () => {
    expect(parseUserAgentName('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('android');
  });

  it('detects ios from iPhone', () => {
    expect(parseUserAgentName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)')).toBe('ios');
  });

  it('detects ios from iPad', () => {
    expect(parseUserAgentName('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('ios');
  });

  it('detects windows', () => {
    expect(parseUserAgentName('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
  });

  it('detects macos', () => {
    expect(parseUserAgentName('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)')).toBe('macos');
  });

  it('detects linux', () => {
    expect(parseUserAgentName('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
  });

  it('returns web when no OS is detected', () => {
    expect(parseUserAgentName('')).toBe('web');
    expect(parseUserAgentName('CustomBot/1.0')).toBe('web');
  });
});

describe('parseUserAgentPointerWidth', () => {
  it('returns 64 for x64', () => {
    expect(parseUserAgentPointerWidth('x64')).toBe(64);
  });

  it('returns 64 for arm64', () => {
    expect(parseUserAgentPointerWidth('arm64')).toBe(64);
  });

  it('returns 32 for x86', () => {
    expect(parseUserAgentPointerWidth('x86')).toBe(32);
  });

  it('returns 32 for arm', () => {
    expect(parseUserAgentPointerWidth('arm')).toBe(32);
  });

  it('returns -1 for wasm', () => {
    expect(parseUserAgentPointerWidth('wasm')).toBe(-1);
  });

  it('returns -1 for empty string', () => {
    expect(parseUserAgentPointerWidth('')).toBe(-1);
  });
});

describe('parseUserAgentRuntime', () => {
  it('returns unknown when window is null', () => {
    expect(parseUserAgentRuntime(null)).toBe('unknown');
  });

  it('returns unknown when window is undefined', () => {
    expect(parseUserAgentRuntime(undefined)).toBe('unknown');
  });

  it('returns web when no host shell globals are present', () => {
    expect(parseUserAgentRuntime({})).toBe('web');
  });

  it('returns electron when process.versions.electron is present', () => {
    expect(parseUserAgentRuntime({ process: { versions: { electron: '28.0.0' } } })).toBe('electron');
  });

  it('returns tauri when __TAURI__ is present', () => {
    expect(parseUserAgentRuntime({ __TAURI__: {} })).toBe('tauri');
  });

  it('returns capacitor when Capacitor is present', () => {
    expect(parseUserAgentRuntime({ Capacitor: {} })).toBe('capacitor');
  });

  it('prioritizes electron over tauri when both globals are present', () => {
    expect(parseUserAgentRuntime({ __TAURI__: {}, process: { versions: { electron: '28.0.0' } } })).toBe('electron');
  });
});

describe('parseUserAgentVersion', () => {
  it('parses Windows NT version', () => {
    expect(parseUserAgentVersion('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'windows')).toBe('10.0');
  });

  it('parses macOS version with underscore separators', () => {
    expect(parseUserAgentVersion('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'macos')).toBe('10.15.7');
  });

  it('parses macOS version with dot separators', () => {
    expect(parseUserAgentVersion('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15.7)', 'macos')).toBe('10.15.7');
  });

  it('parses iOS version', () => {
    expect(parseUserAgentVersion('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)', 'ios')).toBe('17.4.1');
  });

  it('parses iOS version without iPhone token', () => {
    expect(parseUserAgentVersion('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 'ios')).toBe('17.0');
  });

  it('parses Android version', () => {
    expect(parseUserAgentVersion('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'android')).toBe('14');
  });

  it('returns empty string for linux (no kernel in UA)', () => {
    expect(parseUserAgentVersion('Mozilla/5.0 (X11; Linux x86_64)', 'linux')).toBe('');
  });

  it('returns empty string for unknown name', () => {
    expect(parseUserAgentVersion('any UA', 'unknown')).toBe('');
  });

  it('returns empty string when version is absent', () => {
    expect(parseUserAgentVersion('', 'windows')).toBe('');
  });
});

describe('parseUserAgentVersion shares one extractor with parseUserAgentOsVersion', () => {
  // The two families each carried their own copy of the same four patterns, and the copies had
  // drifted: this one required exactly one space where the other accepts any whitespace, so it
  // returned '' for UAs the other parsed correctly. These pin the agreement, not just the fix.
  const CASES: readonly (readonly [string, PlatformName, string])[] = [
    ['Mozilla/5.0 (Linux; Android  14; SM-X710) AppleWebKit/537.36', 'android', '14'],
    ['Mozilla/5.0 (Windows NT  10.0; Win64; x64)', 'windows', '10.0'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X  10_15_7)', 'macos', '10.15.7'],
  ];

  it('parses the whitespace variants that used to return empty', () => {
    for (const [ua, name, expected] of CASES) {
      expect(parseUserAgentVersion(ua, name)).toBe(expected);
    }
  });

  it('agrees with parseUserAgentOsVersion on every case', () => {
    for (const [ua, name] of CASES) {
      expect(parseUserAgentVersion(ua, name)).toBe(parseUserAgentOsVersion(ua));
    }
  });

  it('returns empty when the requested platform is not the one the UA describes', () => {
    const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    expect(parseUserAgentVersion(win, 'ios')).toBe('');
    expect(parseUserAgentVersion(win, 'macos')).toBe('');
    expect(parseUserAgentVersion(win, 'windows')).toBe('10.0');
  });

  it('does not read a macOS version off an iPad UA that says "like Mac OS X"', () => {
    const ipad = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15';
    expect(parseUserAgentVersion(ipad, 'macos')).toBe('');
    expect(parseUserAgentVersion(ipad, 'ios')).toBe('17.4');
  });

  it('still returns empty for linux and the web fallback', () => {
    const linux = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';
    expect(parseUserAgentVersion(linux, 'linux')).toBe('');
    expect(parseUserAgentVersion('some-native-host/1.0', 'web')).toBe('');
  });
});

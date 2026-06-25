import {
  parseUserAgentArch,
  parseUserAgentEngine,
  parseUserAgentEngineVersion,
  parseUserAgentKind,
  parseUserAgentName,
  parseUserAgentPointerWidth,
  parseUserAgentRuntime,
  parseUserAgentVersion,
  probeEndianness,
} from './userAgent';

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

describe('probeEndianness', () => {
  it('returns a known canonical value', () => {
    expect(['little', 'big', 'unknown']).toContain(probeEndianness());
  });

  it('returns little on Node.js (x64 host)', () => {
    // Node.js always runs on x64/arm64 hardware which is little-endian.
    expect(probeEndianness()).toBe('little');
  });
});

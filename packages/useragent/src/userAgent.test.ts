// Target-native parity tests for crates/flight-useragent/tests/user_agent_test.rs.

import { describe, expect, it } from 'vitest';

import {
  detectEndianness,
  parseUserAgentArch,
  parseUserAgentEngine,
  parseUserAgentEngineVersion,
  parseUserAgentKind,
  parseUserAgentName,
  parseUserAgentOsVersion,
  parseUserAgentPointerWidth,
  parseUserAgentRuntime,
  parseUserAgentVersion,
} from './contract.ts';
import { PlatformEngine, PlatformKind, PlatformName } from './userAgentNative.ts';

const LEGACY_EDGE: string =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/18.17763';

const IOS_PREFIX: string =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ';

function record(entries: Array<readonly [string, unknown]>): Record<string, unknown> {
  return Object.fromEntries(entries);
}

function object(entries: Array<readonly [string, unknown]>): unknown {
  return record(entries);
}

function text(value: string): unknown {
  return String(value);
}

describe('detectEndianness', () => {
  // Rust-only: matches the target byte order
  it('returns a known canonical value', () => {
    const value = detectEndianness();
    expect(value === 'little' || value === 'big' || value === 'unknown').toBe(true);
  });
});

describe('parseUserAgentArch', () => {
  it('detects each arch token in source order', () => {
    expect(parseUserAgentArch('Mozilla/5.0 (Linux; aarch64) AppleWebKit/537.36', undefined)).toEqual('arm64');
    expect(parseUserAgentArch('Mozilla/5.0 (iPhone; CPU arm64)', undefined)).toEqual('arm64');
    expect(parseUserAgentArch('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', undefined)).toEqual(
      'x64',
    );
    expect(parseUserAgentArch('Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36', undefined)).toEqual('x64');
    expect(parseUserAgentArch('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36', undefined)).toEqual('x64');
    expect(parseUserAgentArch('Mozilla/5.0 (X11; Linux i686; rv:109.0)', undefined)).toEqual('x86');
    expect(parseUserAgentArch('Mozilla/5.0 (Linux; armv7l)', undefined)).toEqual('arm');
    expect(parseUserAgentArch('Mozilla/5.0 (Linux; riscv64)', undefined)).toEqual('riscv64');
    expect(parseUserAgentArch('Mozilla/5.0 (Linux; mips64)', undefined)).toEqual('mips64');
    expect(parseUserAgentArch('Mozilla/5.0 (Linux; mips)', undefined)).toEqual('mips');
  });
  it('prefers the ua ch platform hint over the ua string', () => {
    expect(parseUserAgentArch('', 'arm')).toEqual('arm64');
    expect(parseUserAgentArch('', 'Windows')).toEqual('x64');
    expect(parseUserAgentArch('', 'macOS')).toEqual('x64');
    expect(parseUserAgentArch('', 'Linux')).toEqual('x64');
    expect(parseUserAgentArch('', 'Chrome OS')).toEqual('x64');
  });
  it('falls back to the ua string when the platform hint is inconclusive', () => {
    expect(parseUserAgentArch('Mozilla/5.0 (X11; Linux x86_64)', 'SomeCustomPlatform')).toEqual('x64');
  });
  it('treats an empty hint as absent as ts truthiness does', () => {
    expect(parseUserAgentArch('Mozilla/5.0 (Linux; mips)', '')).toEqual('mips');
  });
  it('returns empty string when arch is undetectable', () => {
    expect(parseUserAgentArch('Mozilla/5.0 (X11; Linux) AppleWebKit/537.36', undefined)).toEqual('');
    expect(parseUserAgentArch('SomeCustomBrowser/1.0', undefined)).toEqual('');
  });
});

describe('parseUserAgentEngine', () => {
  it('returns each engine', () => {
    expect(
      parseUserAgentEngine('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0'),
    ).toEqual(PlatformEngine.Gecko);
    expect(
      parseUserAgentEngine(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toEqual(PlatformEngine.Blink);
    expect(
      parseUserAgentEngine(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.133',
      ),
    ).toEqual(PlatformEngine.Blink);
    expect(
      parseUserAgentEngine(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
      ),
    ).toEqual(PlatformEngine.Webkit);
  });
  it('returns unknown for unrecognized ua', () => {
    expect(parseUserAgentEngine('')).toEqual(PlatformEngine.Unknown);
    expect(parseUserAgentEngine('CustomBot/1.0')).toEqual(PlatformEngine.Unknown);
  });
  it('legacy edgehtml is not reported as blink', () => {
    expect(parseUserAgentEngine(LEGACY_EDGE)).toEqual(PlatformEngine.Unknown);
    expect(parseUserAgentEngine('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Edge/18.17763')).toEqual(
      PlatformEngine.Unknown,
    );
    const modern =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
    expect(parseUserAgentEngine(modern)).toEqual(PlatformEngine.Blink);
    expect(parseUserAgentEngine('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) EdgiOS/120.0')).toEqual(
      PlatformEngine.Webkit,
    );
  });
  it('keeps opera on ios product tokens on webkit', () => {
    for (const ua of [
      `${IOS_PREFIX}OPiOS/9.2.0.11256 Mobile/15E148 Safari/9537.53`,
      `${IOS_PREFIX}Version/17.0 OPT/3.6.1 Mobile/15E148 Safari/604.1`,
    ]) {
      const engine = parseUserAgentEngine(ua);
      expect(engine).toEqual(PlatformEngine.Webkit);
      expect(parseUserAgentEngineVersion(ua, engine)).not.toEqual('');
    }
  });
  it('reports webkit for every browser on ios', () => {
    const edge = `${IOS_PREFIX}EdgiOS/120.0.0.0 Mobile/15E148 Safari/605.1.15`;
    expect(parseUserAgentEngine(edge)).toEqual(PlatformEngine.Webkit);
    expect(parseUserAgentEngineVersion(edge, PlatformEngine.Webkit)).not.toEqual('');
    expect(parseUserAgentEngine(`${IOS_PREFIX}CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1`)).toEqual(
      PlatformEngine.Webkit,
    );
    expect(parseUserAgentEngine(`${IOS_PREFIX}FxiOS/121.0 Mobile/15E148 Safari/605.1.15`)).toEqual(
      PlatformEngine.Webkit,
    );
    const ipad =
      'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1';
    expect(parseUserAgentEngine(ipad)).toEqual(PlatformEngine.Webkit);
  });
  it('still reports blink and gecko off ios', () => {
    const mac =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const win =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
    expect(parseUserAgentEngine(mac)).toEqual(PlatformEngine.Blink);
    expect(parseUserAgentEngine(win)).toEqual(PlatformEngine.Blink);
    expect(parseUserAgentEngine('Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0')).toEqual(
      PlatformEngine.Gecko,
    );
  });
});

describe('parseUserAgentEngineVersion', () => {
  it('extracts each engine version', () => {
    expect(
      parseUserAgentEngineVersion(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
        PlatformEngine.Gecko,
      ),
    ).toEqual('120.0');
    expect(
      parseUserAgentEngineVersion(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.109 Safari/537.36',
        PlatformEngine.Blink,
      ),
    ).toEqual('120.0.6099.109');
    expect(
      parseUserAgentEngineVersion(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.133',
        PlatformEngine.Blink,
      ),
    ).toEqual('120.0.2210.133');
    expect(
      parseUserAgentEngineVersion(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
        PlatformEngine.Webkit,
      ),
    ).toEqual('16.0');
  });
  it('returns empty for unknown engine or absent version', () => {
    expect(parseUserAgentEngineVersion('any UA string', PlatformEngine.Unknown)).toEqual('');
    expect(parseUserAgentEngineVersion('', PlatformEngine.Gecko)).toEqual('');
  });
  it('does not report the embedded chrome version for legacy edge', () => {
    const engine = parseUserAgentEngine(LEGACY_EDGE);
    expect(parseUserAgentEngineVersion(LEGACY_EDGE, engine)).toEqual('');
  });
  it('skips an earlier token without digits as the regex does', () => {
    expect(parseUserAgentEngineVersion('Chrome/x Chrome/99.1', PlatformEngine.Blink)).toEqual('99.1');
    expect(parseUserAgentEngineVersion('AppleWebKit/605.1', PlatformEngine.Webkit)).toEqual('605.1');
  });
});

describe('parseUserAgentKind', () => {
  it('returns mobile for ios and android and web otherwise', () => {
    expect(parseUserAgentKind(PlatformName.Ios)).toEqual(PlatformKind.Mobile);
    expect(parseUserAgentKind(PlatformName.Android)).toEqual(PlatformKind.Mobile);
    for (const name of [PlatformName.Windows, PlatformName.MacOs, PlatformName.Linux, PlatformName.Unknown]) {
      expect(parseUserAgentKind(name)).toEqual(PlatformKind.Web);
    }
  });
});

describe('parseUserAgentName', () => {
  it('detects each name', () => {
    expect(parseUserAgentName('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toEqual(PlatformName.Android);
    expect(parseUserAgentName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)')).toEqual(PlatformName.Ios);
    expect(parseUserAgentName('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toEqual(PlatformName.Ios);
    expect(parseUserAgentName('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toEqual(PlatformName.Windows);
    expect(parseUserAgentName('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)')).toEqual(PlatformName.MacOs);
    expect(parseUserAgentName('Mozilla/5.0 (X11; Linux x86_64)')).toEqual(PlatformName.Linux);
  });
  it('returns web when no os is detected', () => {
    expect(parseUserAgentName('')).toEqual(PlatformName.Web);
    expect(parseUserAgentName('CustomBot/1.0')).toEqual(PlatformName.Web);
  });
});

describe('parseUserAgentPointerWidth', () => {
  it('maps arch tokens to widths', () => {
    expect(parseUserAgentPointerWidth('x64')).toEqual(64);
    expect(parseUserAgentPointerWidth('arm64')).toEqual(64);
    expect(parseUserAgentPointerWidth('x86')).toEqual(32);
    expect(parseUserAgentPointerWidth('arm')).toEqual(32);
    expect(parseUserAgentPointerWidth('wasm')).toEqual(-1);
    expect(parseUserAgentPointerWidth('')).toEqual(-1);
  });
});

describe('parseUserAgentRuntime', () => {
  it('returns unknown when window is absent', () => {
    expect(parseUserAgentRuntime(undefined)).toEqual('unknown');
  });
  it('returns web when no host shell globals are present', () => {
    expect(parseUserAgentRuntime(record([]))).toEqual('web');
  });
  it('detects each host shell', () => {
    const electron = record([['process', object([['versions', object([['electron', text('28.0.0')]])]])]]);
    expect(parseUserAgentRuntime(electron)).toEqual('electron');
    expect(parseUserAgentRuntime(record([['__TAURI__', object([])]]))).toEqual('tauri');
    expect(parseUserAgentRuntime(record([['Capacitor', object([])]]))).toEqual('capacitor');
  });
  it('prioritizes electron over tauri when both globals are present', () => {
    const both = record([
      ['__TAURI__', object([])],
      ['process', object([['versions', object([['electron', text('28.0.0')]])]])],
    ]);
    expect(parseUserAgentRuntime(both)).toEqual('electron');
  });
  it('follows js truthiness for probed values', () => {
    expect(parseUserAgentRuntime(record([['__TAURI__', undefined]]))).toEqual('web');
    expect(parseUserAgentRuntime(record([['Capacitor', text('')]]))).toEqual('web');
    expect(parseUserAgentRuntime(record([['Capacitor', false]]))).toEqual('web');
    expect(parseUserAgentRuntime(record([['Capacitor', 0.0]]))).toEqual('web');
    expect(parseUserAgentRuntime(record([['Capacitor', 1]]))).toEqual('capacitor');
    const stringVersions = record([['process', object([['versions', text('x')]])]]);
    expect(parseUserAgentRuntime(stringVersions)).toEqual('web');
    const emptyElectron = record([['process', object([['versions', object([['electron', text('')]])]])]]);
    expect(parseUserAgentRuntime(emptyElectron)).toEqual('web');
  });
});

describe('parseUserAgentVersion', () => {
  it('parses each platform version', () => {
    expect(parseUserAgentVersion('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', PlatformName.Windows)).toEqual('10.0');
    expect(parseUserAgentVersion('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', PlatformName.MacOs)).toEqual(
      '10.15.7',
    );
    expect(parseUserAgentVersion('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15.7)', PlatformName.MacOs)).toEqual(
      '10.15.7',
    );
    expect(parseUserAgentVersion('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)', PlatformName.Ios)).toEqual(
      '17.4.1',
    );
    expect(parseUserAgentVersion('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', PlatformName.Ios)).toEqual('17.0');
    expect(parseUserAgentVersion('Mozilla/5.0 (Linux; Android 14; Pixel 8)', PlatformName.Android)).toEqual('14');
  });
  it('returns empty for linux unknown and absent versions', () => {
    expect(parseUserAgentVersion('Mozilla/5.0 (X11; Linux x86_64)', PlatformName.Linux)).toEqual('');
    expect(parseUserAgentVersion('any UA', PlatformName.Unknown)).toEqual('');
    expect(parseUserAgentVersion('', PlatformName.Windows)).toEqual('');
  });
  it('shares one extractor with parse user agent os version', () => {
    const cases: Array<readonly [string, PlatformName, string]> = [
      ['Mozilla/5.0 (Linux; Android  14; SM-X710) AppleWebKit/537.36', PlatformName.Android, '14'],
      ['Mozilla/5.0 (Windows NT  10.0; Win64; x64)', PlatformName.Windows, '10.0'],
      ['Mozilla/5.0 (Macintosh; Intel Mac OS X  10_15_7)', PlatformName.MacOs, '10.15.7'],
    ];
    for (const [ua, name, expected] of cases) {
      expect(parseUserAgentVersion(ua, name)).toEqual(expected);
      expect(parseUserAgentVersion(ua, name)).toEqual(parseUserAgentOsVersion(ua));
    }
  });
  it('returns empty when the requested platform is not the one the ua describes', () => {
    const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    expect(parseUserAgentVersion(win, PlatformName.Ios)).toEqual('');
    expect(parseUserAgentVersion(win, PlatformName.MacOs)).toEqual('');
    expect(parseUserAgentVersion(win, PlatformName.Windows)).toEqual('10.0');
    const ipad = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15';
    expect(parseUserAgentVersion(ipad, PlatformName.MacOs)).toEqual('');
    expect(parseUserAgentVersion(ipad, PlatformName.Ios)).toEqual('17.4');
    expect(parseUserAgentVersion('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36', PlatformName.Linux)).toEqual('');
    expect(parseUserAgentVersion('some-native-host/1.0', PlatformName.Web)).toEqual('');
  });
});

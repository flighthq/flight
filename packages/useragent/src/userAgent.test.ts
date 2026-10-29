// Generated from crates/flight-useragent/tests/user_agent_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  parseUserAgentArch,
  parseUserAgentEngine,
  parseUserAgentEngineVersion,
  parseUserAgentKind,
  parseUserAgentName,
  parseUserAgentOsVersion,
  parseUserAgentPointerWidth,
  parseUserAgentVersion,
} from './contract.ts';

function iosPrefix(): string {
  return 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ';
}

function legacyEdge(): string {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/18.17763';
}

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
    const gecko = parseUserAgentEngine(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    );
    const blink = parseUserAgentEngine(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );
    expect(
      parseUserAgentEngine(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.133',
      ),
    ).toEqual(blink);
    const webkit = parseUserAgentEngine(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
    );
    expect(gecko).not.toEqual(blink);
    expect(gecko).not.toEqual(webkit);
    expect(blink).not.toEqual(webkit);
  });
  it('returns unknown for unrecognized ua', () => {
    const unknown = parseUserAgentEngine('');
    expect(parseUserAgentEngine('CustomBot/1.0')).toEqual(unknown);
    expect(parseUserAgentEngine('Chrome/120.0')).not.toEqual(unknown);
  });
  it('legacy edgehtml is not reported as blink', () => {
    const unknown = parseUserAgentEngine('');
    expect(parseUserAgentEngine(legacyEdge())).toEqual(unknown);
    expect(parseUserAgentEngine('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Edge/18.17763')).toEqual(unknown);
    const modern =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
    const blink = parseUserAgentEngine('Chrome/120.0');
    expect(parseUserAgentEngine(modern)).toEqual(blink);
    const iosEdge = parseUserAgentEngine('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) EdgiOS/120.0');
    expect(iosEdge).not.toEqual(blink);
    expect(iosEdge).not.toEqual(unknown);
  });
  it('keeps opera on ios product tokens on webkit', () => {
    const webkit = parseUserAgentEngine('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15');
    for (const ua of [
      `${iosPrefix()}OPiOS/9.2.0.11256 Mobile/15E148 Safari/9537.53`,
      `${iosPrefix()}Version/17.0 OPT/3.6.1 Mobile/15E148 Safari/604.1`,
    ]) {
      const engine = parseUserAgentEngine(ua);
      expect(engine).toEqual(webkit);
      expect(parseUserAgentEngineVersion(ua, engine)).not.toEqual('');
    }
  });
  it('reports webkit for every browser on ios', () => {
    const webkit = parseUserAgentEngine('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15');
    const edge = `${iosPrefix()}EdgiOS/120.0.0.0 Mobile/15E148 Safari/605.1.15`;
    expect(parseUserAgentEngine(edge)).toEqual(webkit);
    expect(parseUserAgentEngineVersion(edge, webkit)).not.toEqual('');
    expect(parseUserAgentEngine(`${iosPrefix()}CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1`)).toEqual(webkit);
    expect(parseUserAgentEngine(`${iosPrefix()}FxiOS/121.0 Mobile/15E148 Safari/605.1.15`)).toEqual(webkit);
    const ipad =
      'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1';
    expect(parseUserAgentEngine(ipad)).toEqual(webkit);
  });
  it('still reports blink and gecko off ios', () => {
    const mac =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const win =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
    const blink = parseUserAgentEngine('Chrome/120.0');
    const gecko = parseUserAgentEngine('Firefox/120.0');
    expect(parseUserAgentEngine(mac)).toEqual(blink);
    expect(parseUserAgentEngine(win)).toEqual(blink);
    expect(parseUserAgentEngine('Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0')).toEqual(
      gecko,
    );
  });
});

describe('parseUserAgentEngineVersion', () => {
  it('extracts each engine version', () => {
    const geckoUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0';
    expect(parseUserAgentEngineVersion(geckoUa, parseUserAgentEngine(geckoUa))).toEqual('120.0');
    const chromeUa =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.109 Safari/537.36';
    expect(parseUserAgentEngineVersion(chromeUa, parseUserAgentEngine(chromeUa))).toEqual('120.0.6099.109');
    const edgeUa =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.133';
    expect(parseUserAgentEngineVersion(edgeUa, parseUserAgentEngine(edgeUa))).toEqual('120.0.2210.133');
    const safariUa =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15';
    expect(parseUserAgentEngineVersion(safariUa, parseUserAgentEngine(safariUa))).toEqual('16.0');
  });
  it('returns empty for unknown engine or absent version', () => {
    const unknown = parseUserAgentEngine('');
    expect(parseUserAgentEngineVersion('any UA string', unknown)).toEqual('');
    const gecko = parseUserAgentEngine('Firefox/120.0');
    expect(parseUserAgentEngineVersion('', gecko)).toEqual('');
  });
  it('does not report the embedded chrome version for legacy edge', () => {
    const engine = parseUserAgentEngine(legacyEdge());
    expect(parseUserAgentEngineVersion(legacyEdge(), engine)).toEqual('');
  });
  it('skips an earlier token without digits as the regex does', () => {
    const blink = parseUserAgentEngine('Chrome/120.0');
    expect(parseUserAgentEngineVersion('Chrome/x Chrome/99.1', blink)).toEqual('99.1');
    const webkit = parseUserAgentEngine('AppleWebKit/605.1');
    expect(parseUserAgentEngineVersion('AppleWebKit/605.1', webkit)).toEqual('605.1');
  });
});

describe('parseUserAgentKind', () => {
  it('returns mobile for ios and android and web otherwise', () => {
    const ios = parseUserAgentName('Mozilla/5.0 (iPhone)');
    const android = parseUserAgentName('Mozilla/5.0 (Linux; Android 14)');
    const mobile = parseUserAgentKind(ios);
    expect(parseUserAgentKind(android)).toEqual(mobile);
    for (const ua of [
      'Mozilla/5.0 (Windows NT 10.0)',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)',
      'Mozilla/5.0 (X11; Linux x86_64)',
      'CustomBot/1.0',
    ]) {
      expect(parseUserAgentKind(parseUserAgentName(ua))).not.toEqual(mobile);
    }
  });
});

describe('parseUserAgentName', () => {
  it('detects each name', () => {
    const android = parseUserAgentName('Mozilla/5.0 (Linux; Android 14; Pixel 8)');
    const ios = parseUserAgentName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)');
    expect(parseUserAgentName('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toEqual(ios);
    const windows = parseUserAgentName('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    const mac = parseUserAgentName('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)');
    const linux = parseUserAgentName('Mozilla/5.0 (X11; Linux x86_64)');
    const web = parseUserAgentName('');
    expect(android).not.toEqual(ios);
    expect(android).not.toEqual(linux);
    expect(ios).not.toEqual(mac);
    expect(windows).not.toEqual(mac);
    expect(windows).not.toEqual(linux);
    expect(mac).not.toEqual(linux);
    expect(web).not.toEqual(android);
    expect(web).not.toEqual(ios);
    expect(web).not.toEqual(windows);
    expect(web).not.toEqual(mac);
    expect(web).not.toEqual(linux);
  });
  it('returns web when no os is detected', () => {
    const web = parseUserAgentName('');
    expect(parseUserAgentName('CustomBot/1.0')).toEqual(web);
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

describe('parseUserAgentVersion', () => {
  it('parses each platform version', () => {
    const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
    expect(parseUserAgentVersion(windows, parseUserAgentName(windows))).toEqual('10.0');
    const macUnderscores = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
    expect(parseUserAgentVersion(macUnderscores, parseUserAgentName(macUnderscores))).toEqual('10.15.7');
    const macDots = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15.7)';
    expect(parseUserAgentVersion(macDots, parseUserAgentName(macDots))).toEqual('10.15.7');
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)';
    expect(parseUserAgentVersion(iphone, parseUserAgentName(iphone))).toEqual('17.4.1');
    const ipad = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)';
    expect(parseUserAgentVersion(ipad, parseUserAgentName(ipad))).toEqual('17.0');
    const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8)';
    expect(parseUserAgentVersion(android, parseUserAgentName(android))).toEqual('14');
  });
  it('returns empty for linux unknown and absent versions', () => {
    const linux = 'Mozilla/5.0 (X11; Linux x86_64)';
    expect(parseUserAgentVersion(linux, parseUserAgentName(linux))).toEqual('');
    const windows = parseUserAgentName('Mozilla/5.0 (Windows NT 10.0)');
    expect(parseUserAgentVersion('', windows)).toEqual('');
  });
  it('shares one extractor with parse user agent os version', () => {
    const cases = [
      ['Mozilla/5.0 (Linux; Android  14; SM-X710) AppleWebKit/537.36', '14'],
      ['Mozilla/5.0 (Windows NT  10.0; Win64; x64)', '10.0'],
      ['Mozilla/5.0 (Macintosh; Intel Mac OS X  10_15_7)', '10.15.7'],
    ];
    for (const [ua, expected] of cases) {
      const name = parseUserAgentName(ua);
      expect(parseUserAgentVersion(ua, name)).toEqual(expected);
      expect(parseUserAgentVersion(ua, name)).toEqual(parseUserAgentOsVersion(ua));
    }
  });
  it('returns empty when the requested platform is not the one the ua describes', () => {
    const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    const iosName = parseUserAgentName('Mozilla/5.0 (iPhone)');
    const macName = parseUserAgentName('Mozilla/5.0 (Macintosh)');
    const windowsName = parseUserAgentName(win);
    expect(parseUserAgentVersion(win, iosName)).toEqual('');
    expect(parseUserAgentVersion(win, macName)).toEqual('');
    expect(parseUserAgentVersion(win, windowsName)).toEqual('10.0');
    const ipad = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15';
    expect(parseUserAgentVersion(ipad, macName)).toEqual('');
    expect(parseUserAgentVersion(ipad, iosName)).toEqual('17.4');
    const linux = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';
    expect(parseUserAgentVersion(linux, parseUserAgentName(linux))).toEqual('');
    const webName = parseUserAgentName('');
    expect(parseUserAgentVersion('some-native-host/1.0', webName)).toEqual('');
  });
});

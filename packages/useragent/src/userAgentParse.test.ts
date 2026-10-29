// Generated from crates/flight-useragent/tests/user_agent_parse_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  DeviceFormFactorCar,
  DeviceFormFactorDesktop,
  DeviceFormFactorPhone,
  DeviceFormFactorTV,
  DeviceFormFactorTablet,
  DeviceFormFactorUnknown,
  DeviceFormFactorWatch,
  parseUserAgentFormFactor,
  parseUserAgentOsName,
  parseUserAgentOsVersion,
} from './contract.ts';

const IPAD_DESKTOP_MODE: string =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

const REAL_MAC: string =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

describe('parseUserAgentFormFactor', () => {
  it('returns car for android auto ua', () => {
    expect(parseUserAgentFormFactor('Android Auto', -1)).toEqual(DeviceFormFactorCar);
  });
  it('returns tv for smart tv uas', () => {
    expect(parseUserAgentFormFactor('Mozilla/5.0 (SmartTV; Linux)', -1)).toEqual(DeviceFormFactorTV);
    expect(parseUserAgentFormFactor('Mozilla/5.0 (SMART-TV; LINUX)', -1)).toEqual(DeviceFormFactorTV);
    expect(parseUserAgentFormFactor('Dalvik/2.1.0 (Linux; Android; GoogleTV)', -1)).toEqual(DeviceFormFactorTV);
  });
  it('returns watch for watch os ua', () => {
    expect(parseUserAgentFormFactor('Mozilla/5.0 (Watch OS 10.0)', -1)).toEqual(DeviceFormFactorWatch);
    expect(parseUserAgentFormFactor('wearable/1.0', -1)).toEqual(DeviceFormFactorWatch);
  });
  it('returns tablet for ipad ua', () => {
    expect(parseUserAgentFormFactor('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 5)).toEqual(
      DeviceFormFactorTablet,
    );
  });
  it('returns tablet for android tablet ua without mobile token', () => {
    const androidTablet = 'Mozilla/5.0 (Linux; Android 13; SM-T870) AppleWebKit/537.36';
    expect(parseUserAgentFormFactor(androidTablet, 5)).toEqual(DeviceFormFactorTablet);
  });
  it('returns phone for iphone ua', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
    expect(parseUserAgentFormFactor(iphone, 5)).toEqual(DeviceFormFactorPhone);
  });
  it('returns phone for android mobile ua', () => {
    const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36';
    expect(parseUserAgentFormFactor(android, 5)).toEqual(DeviceFormFactorPhone);
  });
  it('returns desktop for windows ua', () => {
    const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    expect(parseUserAgentFormFactor(win, 0)).toEqual(DeviceFormFactorDesktop);
  });
  it('returns desktop for macos ua', () => {
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36';
    expect(parseUserAgentFormFactor(mac, 0)).toEqual(DeviceFormFactorDesktop);
  });
  it('returns desktop when max touch points is 0 and ua is inconclusive', () => {
    expect(parseUserAgentFormFactor('SomeBrowser/1.0', 0)).toEqual(DeviceFormFactorDesktop);
  });
  it('returns unknown for empty ua with touch points unavailable', () => {
    expect(parseUserAgentFormFactor('', -1)).toEqual(DeviceFormFactorUnknown);
  });
  it('desktop mode ipad classifies a touch capable macintosh ua as a tablet', () => {
    expect(parseUserAgentFormFactor(IPAD_DESKTOP_MODE, 5)).toEqual(DeviceFormFactorTablet);
  });
  it('desktop mode ipad still classifies a real mac as a desktop', () => {
    expect(parseUserAgentFormFactor(REAL_MAC, 0)).toEqual(DeviceFormFactorDesktop);
  });
  it('desktop mode ipad does not guess from an unavailable touch hint', () => {
    expect(parseUserAgentFormFactor(IPAD_DESKTOP_MODE, -1)).toEqual(DeviceFormFactorDesktop);
  });
  it('desktop mode ipad needs more than one touch point', () => {
    expect(parseUserAgentFormFactor(REAL_MAC, 1)).toEqual(DeviceFormFactorDesktop);
  });
  it('desktop mode ipad leaves an iphone a phone even though it says like mac os x', () => {
    const iphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(parseUserAgentFormFactor(iphone, 5)).toEqual(DeviceFormFactorPhone);
  });
  it('desktop mode ipad leaves a classic ipad ua a tablet', () => {
    const ipad =
      'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
    expect(parseUserAgentFormFactor(ipad, 5)).toEqual(DeviceFormFactorTablet);
  });
  it('keeps the source desktop token set exactly', () => {
    const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
    expect(parseUserAgentFormFactor(win, -1)).toEqual(DeviceFormFactorUnknown);
    expect(parseUserAgentFormFactor('Mozilla/5.0 (WinNT)', -1)).toEqual(DeviceFormFactorDesktop);
  });
  it('follows js regex line and lookahead semantics', () => {
    expect(parseUserAgentFormFactor('webOS\ntv', -1)).toEqual(DeviceFormFactorUnknown);
    expect(parseUserAgentFormFactor('webOS SmartPanel tv', -1)).toEqual(DeviceFormFactorTV);
    expect(parseUserAgentFormFactor('Linux; Android\nMobile', -1)).toEqual(DeviceFormFactorUnknown);
    expect(parseUserAgentFormFactor('Linux\nAndroid\nMobile', -1)).toEqual(DeviceFormFactorDesktop);
    expect(parseUserAgentFormFactor('iKad', -1)).toEqual(DeviceFormFactorUnknown);
  });
});

describe('parseUserAgentOsName', () => {
  it('returns each canonical name', () => {
    expect(parseUserAgentOsName('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toEqual('Android');
    expect(parseUserAgentOsName('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toEqual('iPadOS');
    expect(parseUserAgentOsName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toEqual('iOS');
    expect(parseUserAgentOsName('Mozilla/5.0 (iPod touch; CPU iPhone OS 16_0 like Mac OS X)')).toEqual('iOS');
    expect(parseUserAgentOsName('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toEqual('Windows');
    expect(parseUserAgentOsName('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)')).toEqual('macOS');
    expect(parseUserAgentOsName('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)')).toEqual('ChromeOS');
    expect(parseUserAgentOsName('Mozilla/5.0 (X11; Linux x86_64)')).toEqual('Linux');
    expect(parseUserAgentOsName('Mozilla/5.0 (X11; FreeBSD amd64)')).toEqual('FreeBSD');
    expect(parseUserAgentOsName('OpenBSD')).toEqual('OpenBSD');
    expect(parseUserAgentOsName('NetBSD')).toEqual('NetBSD');
  });
  it('returns empty string for unknown ua', () => {
    expect(parseUserAgentOsName('')).toEqual('');
    expect(parseUserAgentOsName('CustomBot/1.0')).toEqual('');
  });
});

describe('parseUserAgentOsVersion', () => {
  it('parses android version', () => {
    expect(parseUserAgentOsVersion('Mozilla/5.0 (Linux; Android 14.0; Pixel)')).toEqual('14.0');
    expect(parseUserAgentOsVersion('Mozilla/5.0 (Linux; Android 9; SM-G950F)')).toEqual('9');
  });
  it('parses ios version with underscore notation', () => {
    expect(parseUserAgentOsVersion('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_1 like Mac OS X)')).toEqual('17.0.1');
    expect(parseUserAgentOsVersion('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)')).toEqual('16.0');
  });
  it('parses windows nt version', () => {
    expect(parseUserAgentOsVersion('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toEqual('10.0');
    expect(parseUserAgentOsVersion('Mozilla/5.0 (Windows NT 6.1; WOW64)')).toEqual('6.1');
  });
  it('parses macos version with underscore and dot notation', () => {
    expect(parseUserAgentOsVersion('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toEqual('10.15.7');
    expect(parseUserAgentOsVersion('Mozilla/5.0 (Macintosh; Intel Mac OS X 13.0)')).toEqual('13.0');
  });
  it('parses chromeos version', () => {
    expect(parseUserAgentOsVersion('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)')).toEqual('14541.0.0');
  });
  it('returns empty string for unknown ua', () => {
    expect(parseUserAgentOsVersion('')).toEqual('');
    expect(parseUserAgentOsVersion('CustomBot/1.0')).toEqual('');
  });
  it('uses the js whitespace set and lazy ios scan', () => {
    expect(parseUserAgentOsVersion('Android\u{a0}12')).toEqual('12');
    expect(parseUserAgentOsVersion('Android\u{feff}12')).toEqual('12');
    expect(parseUserAgentOsVersion('Android\u{85}12')).toEqual('');
    expect(parseUserAgentOsVersion('iPhone; CPU iPhone OS 16_2 like Mac OS X 10_15')).toEqual('16.2');
    expect(parseUserAgentOsVersion('iPhone\nOS 16_2')).toEqual('');
  });
});

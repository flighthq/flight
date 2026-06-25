import {
  DeviceFormFactorCar,
  DeviceFormFactorDesktop,
  DeviceFormFactorPhone,
  DeviceFormFactorTablet,
  DeviceFormFactorTV,
  DeviceFormFactorUnknown,
  DeviceFormFactorWatch,
} from '@flighthq/types';

import { parseUserAgentFormFactor, parseUserAgentOsName, parseUserAgentOsVersion } from './userAgentParse';

describe('parseUserAgentFormFactor', () => {
  it('returns Automotive for Android Auto UA', () => {
    expect(parseUserAgentFormFactor('Android Auto', -1)).toBe(DeviceFormFactorCar);
  });

  it('returns TV for smart TV UAs', () => {
    expect(parseUserAgentFormFactor('Mozilla/5.0 (SmartTV; Linux)', -1)).toBe(DeviceFormFactorTV);
    expect(parseUserAgentFormFactor('Mozilla/5.0 (SMART-TV; LINUX)', -1)).toBe(DeviceFormFactorTV);
    expect(parseUserAgentFormFactor('Dalvik/2.1.0 (Linux; Android; GoogleTV)', -1)).toBe(DeviceFormFactorTV);
  });

  it('returns Watch for WatchOS UA', () => {
    expect(parseUserAgentFormFactor('Mozilla/5.0 (Watch OS 10.0)', -1)).toBe(DeviceFormFactorWatch);
    expect(parseUserAgentFormFactor('wearable/1.0', -1)).toBe(DeviceFormFactorWatch);
  });

  it('returns Tablet for iPad UA', () => {
    const ipad = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)';
    expect(parseUserAgentFormFactor(ipad, 5)).toBe(DeviceFormFactorTablet);
  });

  it('returns Tablet for Android tablet UA (no Mobile token)', () => {
    const androidTablet = 'Mozilla/5.0 (Linux; Android 13; SM-T870) AppleWebKit/537.36';
    expect(parseUserAgentFormFactor(androidTablet, 5)).toBe(DeviceFormFactorTablet);
  });

  it('returns Phone for iPhone UA', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
    expect(parseUserAgentFormFactor(iphone, 5)).toBe(DeviceFormFactorPhone);
  });

  it('returns Phone for Android mobile UA', () => {
    const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36';
    expect(parseUserAgentFormFactor(android, 5)).toBe(DeviceFormFactorPhone);
  });

  it('returns Desktop for Windows UA', () => {
    const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    expect(parseUserAgentFormFactor(win, 0)).toBe(DeviceFormFactorDesktop);
  });

  it('returns Desktop for macOS UA', () => {
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36';
    expect(parseUserAgentFormFactor(mac, 0)).toBe(DeviceFormFactorDesktop);
  });

  it('returns Desktop when maxTouchPoints is 0 and UA is inconclusive', () => {
    expect(parseUserAgentFormFactor('SomeBrowser/1.0', 0)).toBe(DeviceFormFactorDesktop);
  });

  it('returns Unknown for empty UA with touch points available', () => {
    expect(parseUserAgentFormFactor('', -1)).toBe(DeviceFormFactorUnknown);
  });
});

describe('parseUserAgentOsName', () => {
  it('returns Android for Android UA', () => {
    expect(parseUserAgentOsName('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('Android');
  });

  it('returns iPadOS for iPad UA', () => {
    expect(parseUserAgentOsName('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('iPadOS');
  });

  it('returns iOS for iPhone/iPod UA', () => {
    expect(parseUserAgentOsName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('iOS');
    expect(parseUserAgentOsName('Mozilla/5.0 (iPod touch; CPU iPhone OS 16_0 like Mac OS X)')).toBe('iOS');
  });

  it('returns Windows for Windows UA', () => {
    expect(parseUserAgentOsName('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows');
  });

  it('returns macOS for Macintosh UA', () => {
    expect(parseUserAgentOsName('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)')).toBe('macOS');
  });

  it('returns ChromeOS for CrOS UA', () => {
    expect(parseUserAgentOsName('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)')).toBe('ChromeOS');
  });

  it('returns Linux for Linux UA', () => {
    expect(parseUserAgentOsName('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Linux');
  });

  it('returns FreeBSD for FreeBSD UA', () => {
    expect(parseUserAgentOsName('Mozilla/5.0 (X11; FreeBSD amd64)')).toBe('FreeBSD');
  });

  it('returns empty string for unknown UA', () => {
    expect(parseUserAgentOsName('')).toBe('');
    expect(parseUserAgentOsName('CustomBot/1.0')).toBe('');
  });
});

describe('parseUserAgentOsVersion', () => {
  it('parses Android version', () => {
    expect(parseUserAgentOsVersion('Mozilla/5.0 (Linux; Android 14.0; Pixel)')).toBe('14.0');
    expect(parseUserAgentOsVersion('Mozilla/5.0 (Linux; Android 9; SM-G950F)')).toBe('9');
  });

  it('parses iOS version with underscore notation', () => {
    expect(parseUserAgentOsVersion('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_1 like Mac OS X)')).toBe('17.0.1');
    expect(parseUserAgentOsVersion('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)')).toBe('16.0');
  });

  it('parses Windows NT version', () => {
    expect(parseUserAgentOsVersion('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('10.0');
    expect(parseUserAgentOsVersion('Mozilla/5.0 (Windows NT 6.1; WOW64)')).toBe('6.1');
  });

  it('parses macOS version with underscore and dot notation', () => {
    expect(parseUserAgentOsVersion('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('10.15.7');
    expect(parseUserAgentOsVersion('Mozilla/5.0 (Macintosh; Intel Mac OS X 13.0)')).toBe('13.0');
  });

  it('parses ChromeOS version', () => {
    expect(parseUserAgentOsVersion('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)')).toBe('14541.0.0');
  });

  it('returns empty string for unknown UA', () => {
    expect(parseUserAgentOsVersion('')).toBe('');
    expect(parseUserAgentOsVersion('CustomBot/1.0')).toBe('');
  });
});

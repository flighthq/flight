// Generated from crates/flight-useragent/src/user_agent_parse.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { DeviceFormFactor } from './deviceFormFactor.ts';
import {
  DeviceFormFactorCar,
  DeviceFormFactorDesktop,
  DeviceFormFactorPhone,
  DeviceFormFactorTV,
  DeviceFormFactorTablet,
  DeviceFormFactorUnknown,
  DeviceFormFactorWatch,
} from './deviceFormFactor.ts';
import {
  captureAfter,
  captureAfterWhitespace,
  charsOf,
  contains,
  containsAny,
  containsThenOnLine,
  isAsciiDigit,
  isDigitOrDot,
  isDigitOrUnderscore,
  isDigitUnderscoreOrDot,
  isJsLineTerminator,
  isJsWhitespace,
  isNotJsWhitespace,
  matchesAt,
  positions,
  runLen,
  underscoresToDots,
} from './jsPattern.ts';

/**
 * `bb\d+`
 */
function bbDigits(t: Readonly<number[]>): boolean {
  return positions(t, 'bb').some((at) => runLen(t, at + 2, isAsciiDigit) > 0);
}

/**
 * `cros\s+\S+\s+([\d.]+)`: the greedy runs are disjoint, so no backtracking alternative exists.
 */
function crosVersion(t: Readonly<number[]>): string | undefined {
  for (const at of positions(t, 'cros')) {
    let k = at + 4;
    let ws = runLen(t, k, isJsWhitespace);
    if (ws === 0) {
      continue;
    }
    k += ws;
    const token = runLen(t, k, isNotJsWhitespace);
    if (token === 0) {
      continue;
    }
    k += token;
    ws = runLen(t, k, isJsWhitespace);
    if (ws === 0) {
      continue;
    }
    k += ws;
    const len = runLen(t, k, isDigitOrDot);
    if (len > 0) {
      return captureAfter(t.slice(k), '', isDigitOrDot);
    }
  }
  return undefined;
}

/**
 * `(?:iphone|ipad|ipod).*?os\s+([\d]+)`: from each device-token start, the lazy `.*?` extends one
 * char at a time (never across a line terminator) until `os\s+[\d]+` matches.
 */
function iosVersion(t: Readonly<number[]>): string | undefined {
  let at = 0;
  while (at < t.length) {
    const deviceLen = matchesAt(t, at, 'iphone') ? 6 : matchesAt(t, at, 'ipad') || matchesAt(t, at, 'ipod') ? 4 : 0;
    if (deviceLen > 0) {
      let k = at + deviceLen;
      for (;;) {
        if (matchesAt(t, k, 'os')) {
          const ws = runLen(t, k + 2, isJsWhitespace);
          if (ws > 0) {
            const start = k + 2 + ws;
            const digits = runLen(t, start, isDigitOrUnderscore);
            if (digits > 0) {
              return captureAfter(t.slice(start), '', isDigitOrUnderscore);
            }
          }
        }
        if (k >= t.length || isJsLineTerminator(t[k])) {
          break;
        }
        k += 1;
      }
    }
    at += 1;
  }
  return undefined;
}

/**
 * `linux(?!.*android)`: a `linux` with no `android` after it on the same line.
 */
function linuxWithoutAndroid(t: Readonly<number[]>): boolean {
  return positions(t, 'linux').some((at) => {
    let k = at + 5;
    for (;;) {
      if (matchesAt(t, k, 'android')) {
        return false;
      }
      if (k >= t.length || isJsLineTerminator(t[k])) {
        return true;
      }
      k += 1;
    }
  });
}

/**
 * Parses a device form factor from a UA string and a touch-point hint (`maxTouchPoints`:
 * `navigator.maxTouchPoints`, or -1 when unavailable). Never returns ""; falls back to
 * `DEVICE_FORM_FACTOR_UNKNOWN`. Branch order is the source's: car, TV, watch, tablet, phone, a
 * touch-capable Macintosh UA (desktop-mode iPad), desktop tokens, then the zero-touch desktop hint.
 */
export function parseUserAgentFormFactor(ua: string, maxTouchPoints: number): DeviceFormFactor {
  const t = charsOf(ua);
  if (containsAny(t, ['android auto', 'car browser', 'automotive'])) {
    return String(DeviceFormFactorCar);
  }
  if (
    containsAny(t, ['smarttv', 'smart-tv', 'smart_tv', 'googletv', 'appletv', 'hbbtv', 'netcast', 'tv safari']) ||
    containsThenOnLine(t, 'webos', 'tv') ||
    containsThenOnLine(t, 'tizen', 'tv')
  ) {
    return String(DeviceFormFactorTV);
  }
  if (watchThen(t) || contains(t, 'wearable')) {
    return String(DeviceFormFactorWatch);
  }
  if (contains(t, 'ipad')) {
    return String(DeviceFormFactorTablet);
  }
  if (contains(t, 'android') && !contains(t, 'mobile')) {
    return String(DeviceFormFactorTablet);
  }
  if (tabletPc(t) || containsAny(t, ['silk', 'kindle fire'])) {
    return String(DeviceFormFactorTablet);
  }
  if (
    containsAny(t, ['iphone', 'ipod', 'windows phone', 'blackberry', 'mobile safari']) ||
    containsThenOnLine(t, 'android', 'mobile') ||
    bbDigits(t)
  ) {
    return String(DeviceFormFactorPhone);
  }
  if (maxTouchPoints > 1 && containsAny(t, ['macintosh', 'mac os x'])) {
    return String(DeviceFormFactorTablet);
  }
  if (containsAny(t, ['winnt', 'windowsnt', 'macintosh', 'mac os x', 'x11']) || linuxWithoutAndroid(t)) {
    return String(DeviceFormFactorDesktop);
  }
  if (maxTouchPoints === 0) {
    return String(DeviceFormFactorDesktop);
  }
  return String(DeviceFormFactorUnknown);
}

/**
 * Parses an OS name from a UA string, or "" when unknown. Values: "Android", "iPadOS", "iOS",
 * "ChromeOS", "Windows", "macOS", "FreeBSD", "OpenBSD", "NetBSD", "Linux".
 */
export function parseUserAgentOsName(ua: string): string {
  const t = charsOf(ua);
  const name = contains(t, 'android')
    ? 'Android'
    : contains(t, 'ipad')
      ? 'iPadOS'
      : containsAny(t, ['iphone', 'ipod'])
        ? 'iOS'
        : contains(t, 'cros')
          ? 'ChromeOS'
          : containsAny(t, ['windows nt', 'windows phone'])
            ? 'Windows'
            : containsAny(t, ['macintosh', 'mac os x'])
              ? 'macOS'
              : contains(t, 'freebsd')
                ? 'FreeBSD'
                : contains(t, 'openbsd')
                  ? 'OpenBSD'
                  : contains(t, 'netbsd')
                    ? 'NetBSD'
                    : contains(t, 'linux')
                      ? 'Linux'
                      : '';
  return String(name);
}

/**
 * Parses the raw dotted OS version from a UA string, or "" when not found: Android, then
 * iOS/iPadOS (underscores to dots), Windows NT, macOS (underscores to dots), ChromeOS. The single
 * OS-version extractor in this crate. Values are ceilings, not readings: Windows 11 reads "10.0"
 * and macOS since Big Sur reads "10.15.7".
 */
export function parseUserAgentOsVersion(ua: string): string {
  const t = charsOf(ua);
  const androidVersion = captureAfterWhitespace(t, 'android', isDigitOrDot);
  if (androidVersion !== undefined) {
    const version = androidVersion;
    return version;
  }
  const parsedIosVersion = iosVersion(t);
  if (parsedIosVersion !== undefined) {
    const version = parsedIosVersion;
    return underscoresToDots(version);
  }
  const windowsVersion = captureAfterWhitespace(t, 'windows nt', isDigitOrDot);
  if (windowsVersion !== undefined) {
    const version = windowsVersion;
    return version;
  }
  const macVersion = captureAfterWhitespace(t, 'mac os x', isDigitUnderscoreOrDot);
  if (macVersion !== undefined) {
    const version = macVersion;
    return underscoresToDots(version);
  }
  const chromeOsVersion = crosVersion(t);
  if (chromeOsVersion !== undefined) {
    const version = chromeOsVersion;
    return version;
  }
  return '';
}

/**
 * `tablet\s*pc`
 */
function tabletPc(t: Readonly<number[]>): boolean {
  return positions(t, 'tablet').some((at) => matchesAt(t, at + 6 + runLen(t, at + 6, isJsWhitespace), 'pc'));
}

/**
 * `watch\s*os|watch[_ ]?kit`
 */
function watchThen(t: Readonly<number[]>): boolean {
  return positions(t, 'watch').some((at) => {
    const after = at + 5;
    if (matchesAt(t, after + runLen(t, after, isJsWhitespace), 'os')) {
      return true;
    }
    if (matchesAt(t, after, 'kit')) {
      return true;
    }
    return after < t.length && (t[after] === 0x005f || t[after] === 0x0020) && matchesAt(t, after + 1, 'kit');
  });
}

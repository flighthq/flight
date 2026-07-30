import type { DeviceFormFactor } from '@flighthq/types/contract';
import {
  DeviceFormFactorCar,
  DeviceFormFactorDesktop,
  DeviceFormFactorPhone,
  DeviceFormFactorTablet,
  DeviceFormFactorTV,
  DeviceFormFactorUnknown,
  DeviceFormFactorWatch,
} from '@flighthq/types/contract';

// UA-string parsers for device identity fields.
// All functions are pure and side-effect-free — no DOM access, no globals, no state.
// Used by the @flighthq/device web backend; importable independently for testing or custom backends.
//
// Note: UA string parsing is inherently best-effort. Browsers freeze and spoof UAs regularly.
// These parsers target the most common real-world patterns; they are not exhaustive.

// Parses a device form factor from a user-agent string and optional touch-point hint.
// Returns a DeviceFormFactor constant. Never returns '' — falls back to DeviceFormFactorUnknown.
// maxTouchPoints: pass navigator.maxTouchPoints when available; -1 when unavailable.
export function parseUserAgentFormFactor(ua: string, maxTouchPoints: number): DeviceFormFactor {
  // Automotive / in-vehicle
  if (/android auto|car browser|automotive/i.test(ua)) return DeviceFormFactorCar;
  // Smart TV / set-top box
  if (/smart[-_]?tv|smarttv|googletv|appletv|hbbtv|netcast|webos.*tv|tizen.*tv|tv safari/i.test(ua)) {
    return DeviceFormFactorTV;
  }
  // Wearable / watch
  if (/watch\s*os|watch[_ ]?kit|wearable/i.test(ua)) return DeviceFormFactorWatch;
  // Tablet: iPad explicitly; Android without 'Mobile' in UA; Windows tablet
  if (/ipad/i.test(ua)) return DeviceFormFactorTablet;
  if (/android/i.test(ua) && !/mobile/i.test(ua)) return DeviceFormFactorTablet;
  if (/tablet\s*pc|silk|kindle fire/i.test(ua)) return DeviceFormFactorTablet;
  // Phone: known mobile UA tokens
  if (/iphone|ipod|android.*mobile|windows phone|blackberry|bb\d+|mobile safari/i.test(ua)) {
    return DeviceFormFactorPhone;
  }
  // iPadOS in desktop mode reports a Macintosh UA with no iPad token, so the UA alone cannot tell it
  // from a real Mac — touch is the only signal that can. Apple ships no touchscreen Mac (the Touch
  // Bar reports zero touch points), so more than one touch point on a Macintosh UA means iPad. This
  // has to run before the desktop branch, which would otherwise claim the UA on `macintosh` alone and
  // silently call every desktop-mode iPad a desktop. The hint was already threaded into this
  // signature for exactly this purpose and was simply never consulted.
  if (maxTouchPoints > 1 && /macintosh|mac os x/i.test(ua)) return DeviceFormFactorTablet;
  // Desktop: known desktop OS tokens
  if (/win(?:dows)?nt|macintosh|mac os x|linux(?!.*android)|x11/i.test(ua)) return DeviceFormFactorDesktop;
  // Weak desktop signal: no touch points when the UA is otherwise inconclusive
  if (maxTouchPoints === 0) return DeviceFormFactorDesktop;
  return DeviceFormFactorUnknown;
}

// Parses an OS name from a user-agent string.
// Returns a canonical OS name or '' when unknown.
// Common return values: 'Android', 'iOS', 'iPadOS', 'Windows', 'macOS', 'Linux', 'ChromeOS',
// 'FreeBSD', 'OpenBSD', 'NetBSD'.
export function parseUserAgentOsName(ua: string): string {
  if (/android/i.test(ua)) return 'Android';
  if (/ipad/i.test(ua)) return 'iPadOS';
  if (/iphone|ipod/i.test(ua)) return 'iOS';
  if (/cros/i.test(ua)) return 'ChromeOS';
  if (/windows nt|windows phone/i.test(ua)) return 'Windows';
  if (/macintosh|mac os x/i.test(ua)) return 'macOS';
  if (/freebsd/i.test(ua)) return 'FreeBSD';
  if (/openbsd/i.test(ua)) return 'OpenBSD';
  if (/netbsd/i.test(ua)) return 'NetBSD';
  if (/linux/i.test(ua)) return 'Linux';
  return '';
}

// Parses an OS version string from a user-agent string.
// Returns a dotted version string, e.g. '14.0', '10.0', '13.5.1'. Returns '' when not found.
//
// This is the single OS-version extractor in the package: parseUserAgentVersion (the PlatformName
// vocabulary) delegates here rather than carrying its own copy of these patterns, which had already
// drifted — its variants required exactly one space where these accept any whitespace, so it returned
// '' for UAs this handles.
//
// FROZEN UA VALUES — these are ceilings, not readings, and no UA-string parser can do better:
//   - Windows 11 reports `Windows NT 10.0`, identical to Windows 10. Only the UA-CH
//     `platformVersion` hint (>= 13) distinguishes them, and this function takes no hints.
//   - macOS has been frozen at `10_15_7` since Big Sur, so every later macOS reads as 10.15.7.
//   - iPadOS in desktop mode reports the macOS version, not the iPadOS version, because it reports a
//     Macintosh UA (see parseUserAgentFormFactor for how the device is still identified).
// Treat a value from this function as "at least this version", never as an exact one.
export function parseUserAgentOsVersion(ua: string): string {
  // Android: "Android 14.0" or "Android 9"
  const android = ua.match(/android\s+([\d.]+)/i);
  if (android) return android[1];
  // iOS/iPadOS: "iPhone OS 17_0_1" or "CPU OS 16_0"
  const ios = ua.match(/(?:iphone|ipad|ipod).*?os\s+([\d_]+)/i);
  if (ios) return ios[1].replace(/_/g, '.');
  // Windows: "Windows NT 10.0" → "10.0"
  const win = ua.match(/windows nt\s+([\d.]+)/i);
  if (win) return win[1];
  // macOS: "Mac OS X 10_15_7" → "10.15.7" or "Mac OS X 13.0"
  const mac = ua.match(/mac os x\s+([\d_.]+)/i);
  if (mac) return mac[1].replace(/_/g, '.');
  // ChromeOS: "CrOS x86_64 14541.0.0"
  const cros = ua.match(/cros\s+\S+\s+([\d.]+)/i);
  if (cros) return cros[1];
  return '';
}

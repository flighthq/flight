import type { DeviceFormFactor } from '@flighthq/types';
import {
  DeviceFormFactorCar,
  DeviceFormFactorDesktop,
  DeviceFormFactorPhone,
  DeviceFormFactorTablet,
  DeviceFormFactorTV,
  DeviceFormFactorUnknown,
  DeviceFormFactorWatch,
} from '@flighthq/types';

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

import type {
  PlatformEndianness,
  PlatformEngine,
  PlatformKind,
  PlatformName,
  PlatformRuntime,
} from '@flighthq/types/contract';

import { parseUserAgentOsVersion } from './userAgentParse';

// Probe host CPU byte order via a DataView write-then-read.
// Overwhelmingly 'little' on all modern hardware (x86/x64/arm/arm64/wasm).
// Returns 'unknown' if ArrayBuffer is unavailable.
export function detectEndianness(): PlatformEndianness {
  try {
    const buf = new ArrayBuffer(2);
    new Uint16Array(buf)[0] = 0x0102;
    const bytes = new Uint8Array(buf);
    if (bytes[0] === 0x01) return 'big';
    if (bytes[0] === 0x02) return 'little';
  } catch {
    // ArrayBuffer unavailable — treat as unknown.
  }
  return 'unknown';
}

// Parse a browser user-agent string into the canonical CPU architecture token.
// Canonical tokens: 'x64', 'arm64', 'x86', 'arm', 'riscv64', 'mips64', 'mips'. Returns '' when undetectable.
// Note: arm64/aarch64 must be tested before arm to avoid false-positive partial matches.
// The high-entropy navigator.userAgentData.architecture API is async and not used here;
// this function operates on the synchronous UA string, plus an optional UA-CH platform hint.
//
// uadPlatform: pass navigator.userAgentData.platform (Chromium UA-CH) when available — it gives
// cleaner arch detection than the UA string. 'Windows', 'Linux', 'macOS', 'Chrome OS' map to 'x64'
// conservatively; Apple Silicon (M-series) is indistinguishable from x64 via this hint alone.
export function parseUserAgentArch(ua: string, uadPlatform?: string): string {
  if (uadPlatform) {
    const p = uadPlatform.toLowerCase();
    if (p.includes('arm')) return 'arm64';
    if (
      p.includes('x86') ||
      p.includes('windows') ||
      p.includes('linux') ||
      p.includes('mac') ||
      p.includes('chrome')
    ) {
      return 'x64';
    }
  }
  if (/arm64|aarch64/i.test(ua)) return 'arm64';
  if (/arm/i.test(ua)) return 'arm';
  if (/x86_64|win64|wow64|x64/i.test(ua)) return 'x64';
  if (/i[3-6]86|x86/i.test(ua)) return 'x86';
  if (/riscv64/i.test(ua)) return 'riscv64';
  if (/mips64/i.test(ua)) return 'mips64';
  if (/mips/i.test(ua)) return 'mips';
  return '';
}

// Parse a browser user-agent string into the canonical PlatformEngine token.
// Order matters: Edg/Chrome UAs contain 'Safari'; Firefox UAs do not contain 'Chrome'.
// Returns 'unknown' for unrecognized or native-host UAs.
export function parseUserAgentEngine(ua: string): PlatformEngine {
  // iOS and iPadOS decide the engine before any product token does: every browser there is required
  // to run on the system WebKit, whatever it calls itself. Testing the platform first is also what
  // keeps this from playing whack-a-mole with product tokens — `EdgiOS` contains `edg` and was being
  // reported as blink (with an empty version, since no `Edg/` token follows), and any future
  // `<Product>iOS` token would have failed the same way.
  if (/iphone|ipad|ipod/i.test(ua)) return 'webkit';
  if (/firefox/i.test(ua)) return 'gecko';
  // Legacy EdgeHTML Edge (`Edge/18`) is not Blink — Edge only became Chromium at `Edg/79`. It has to be
  // tested before the blink branch, whose `edg` alternative matches it, and it reports 'unknown' rather
  // than a fourth engine value because PlatformEngine has no EdgeHTML member and adding one is a public
  // type change every exhaustive consumer would have to handle. 'unknown' is the documented answer for
  // an engine this SDK does not model, and it is the honest one: saying blink would have a caller apply
  // Chromium workarounds to a browser that never ran Chromium. Distinguished from modern Edge by the
  // trailing `e` — `Edg/` and `EdgiOS/` do not match.
  if (/edge\/\d/i.test(ua)) return 'unknown';
  if (/chrome|chromium|edg|opr|samsung/i.test(ua)) return 'blink';
  if (/safari|webkit/i.test(ua)) return 'webkit';
  return 'unknown';
}

// Extract the browser/engine version string from a user-agent string.
// The engine parameter narrows which version pattern to extract.
// Returns '' when the version is not present or the engine is 'unknown'.
// The returned string is the raw version token — never parsed for semantics.
export function parseUserAgentEngineVersion(ua: string, engine: PlatformEngine): string {
  switch (engine) {
    case 'gecko': {
      // 'Firefox/120.0' → '120.0'
      const m = /firefox\/([\d.]+)/i.exec(ua);
      return m ? m[1] : '';
    }
    case 'blink': {
      // Prefer Edg/OPR over Chrome for Edge/Opera UAs to surface the product version.
      const edg = /edg\/([\d.]+)/i.exec(ua);
      if (edg) return edg[1];
      const opr = /opr\/([\d.]+)/i.exec(ua);
      if (opr) return opr[1];
      const chrome = /chrome\/([\d.]+)/i.exec(ua);
      return chrome ? chrome[1] : '';
    }
    case 'webkit': {
      // 'Version/16.0' → '16.0' for Safari; fall back to AppleWebKit/<version>.
      const ver = /version\/([\d.]+)/i.exec(ua);
      if (ver) return ver[1];
      const wk = /applewebkit\/([\d.]+)/i.exec(ua);
      return wk ? wk[1] : '';
    }
    default:
      return '';
  }
}

// Parse a browser user-agent string into the canonical PlatformKind token.
// Derived from the platform name — mobile OSes yield 'mobile'; everything else yields 'web'.
// Use parseUserAgentName to get the name, then this function to derive the kind.
export function parseUserAgentKind(name: PlatformName): PlatformKind {
  if (name === 'ios' || name === 'android') return 'mobile';
  return 'web';
}

// Parse a browser user-agent string into the canonical PlatformName token.
// Returns 'web' when no known OS is detected (the web fallback).
export function parseUserAgentName(ua: string): PlatformName {
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/win/i.test(ua)) return 'windows';
  if (/mac/i.test(ua)) return 'macos';
  if (/linux/i.test(ua)) return 'linux';
  return 'web';
}

// Infer the native pointer width in bits from a canonical arch token.
// Returns 64 for 'x64'/'arm64', 32 for 'x86'/'arm', -1 when unknown (e.g. 'wasm' or '').
export function parseUserAgentPointerWidth(arch: string): 32 | 64 | -1 {
  if (arch === 'x64' || arch === 'arm64') return 64;
  if (arch === 'x86' || arch === 'arm') return 32;
  return -1;
}

// Infer the host shell / runtime environment from browser-global probes.
// Accepts the window-like object as a parameter for testability; pass `window` in production.
// Returns 'unknown' when the window-like object is null/undefined (SSR, no-DOM contexts).
export function parseUserAgentRuntime(win: Record<string, unknown> | null | undefined): PlatformRuntime {
  if (win == null) return 'unknown';
  // Electron: window.process?.versions?.electron is set in the renderer process.
  const proc = win.process as Record<string, unknown> | undefined;
  if (proc?.versions && (proc.versions as Record<string, unknown>).electron) return 'electron';
  // Tauri: window.__TAURI__ is injected by the Tauri runtime.
  if (win.__TAURI__) return 'tauri';
  // Capacitor: window.Capacitor is set by the Capacitor bridge.
  if (win.Capacitor) return 'capacitor';
  return 'web';
}

// Extract the OS version string from a browser user-agent string for the given platform name.
// Returns the raw dotted version string. Returns '' when the version is not present in the UA, and
// when `name` is not the platform the UA actually describes — asking a Windows UA for its iOS version
// has no answer, and a wrong one would be worse than none.
// Never parsed for semantics — the caller may use comparePlatformVersions for numeric comparison.
//
// The extraction itself lives in parseUserAgentOsVersion; this function is the PlatformName-vocabulary
// view of it. It used to carry its own copy of the same four patterns, and the copies had drifted:
// these required exactly one space (`/android ([\d.]+)/`) where the originals accept any whitespace
// (`/android\s+([\d.]+)/`), so this function returned '' for UAs the other parsed correctly. One
// implementation, two vocabularies — the drift cannot recur.
//
// FROZEN UA VALUES: see parseUserAgentOsVersion. Windows 11 is indistinguishable from Windows 10
// here, and macOS reads 10.15.7 on every version since Big Sur.
export function parseUserAgentVersion(ua: string, name: PlatformName): string {
  // Linux embeds no kernel version in a browser UA, and 'web' is the no-OS-detected fallback.
  if (name === 'linux' || name === 'web') return '';
  if (parseUserAgentName(ua) !== name) return '';
  return parseUserAgentOsVersion(ua);
}

export type PlatformEndianness = 'big' | 'little' | 'unknown';
export type PlatformEngine = 'gecko' | 'blink' | 'webkit' | 'unknown';
export type PlatformKind = 'desktop' | 'mobile' | 'web' | 'unknown';
export type PlatformName = 'web' | 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'unknown';
export type PlatformRuntime = 'web' | 'electron' | 'tauri' | 'capacitor' | 'native' | 'unknown';
export type Unknown = unknown;

export interface Record<T> {
  readonly [key: string]: T;
}

export const PlatformEngine = {
  Gecko: 'gecko',
  Blink: 'blink',
  Webkit: 'webkit',
  Unknown: 'unknown',
} as const;

export const PlatformKind = {
  Desktop: 'desktop',
  Mobile: 'mobile',
  Web: 'web',
  Unknown: 'unknown',
} as const;

export const PlatformName = {
  Web: 'web',
  Windows: 'windows',
  MacOs: 'macos',
  Linux: 'linux',
  Ios: 'ios',
  Android: 'android',
  Unknown: 'unknown',
} as const;

export function detectEndiannessNative(): PlatformEndianness {
  try {
    const buffer = new ArrayBuffer(2);
    new Uint16Array(buffer)[0] = 0x0102;
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0x01) return 'big';
    if (bytes[0] === 0x02) return 'little';
  } catch {
    // ArrayBuffer is unavailable.
  }
  return 'unknown';
}

export function parseUserAgentRuntimeNative(win: Record<unknown> | null | undefined): PlatformRuntime {
  if (win == null) return 'unknown';
  const process = win.process as Record<unknown> | undefined;
  if (process?.versions && (process.versions as Record<unknown>).electron) return 'electron';
  if (win.__TAURI__) return 'tauri';
  if (win.Capacitor) return 'capacitor';
  return 'web';
}

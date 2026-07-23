import type { PlatformBackend, PlatformName, TauriApi } from '@flighthq/types';

// Maps Flight's PlatformBackend onto Tauri's `@tauri-apps/plugin-os`. In Tauri v2 the os plugin's
// accessors are synchronous (resolved from values injected at startup), so the sync getInfo maps
// cleanly. Writes into caller-owned `out` so callers control allocation; unset fields keep the
// pre-populated web defaults the platform package supplies.
export function createTauriPlatformBackend(tauri: TauriApi): PlatformBackend {
  const os = tauri.os;
  return {
    getInfo(out) {
      out.name = toPlatformName(os.platform());
      out.kind = 'desktop';
      out.version = os.version();
      out.arch = os.arch();
      out.locale = os.locale() ?? '';
      out.isTouch = false;
      out.runtime = 'tauri';
      return out;
    },
  };
}

function toPlatformName(platform: string): PlatformName {
  if (platform === 'windows') return 'windows';
  if (platform === 'macos') return 'macos';
  if (platform === 'linux') return 'linux';
  if (platform === 'ios') return 'ios';
  if (platform === 'android') return 'android';
  return 'unknown';
}

import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, PlatformBackend, PlatformName, TauriApi } from '@flighthq/types/contract';

// Maps Flight's PlatformBackend onto Tauri's `@tauri-apps/plugin-os`. Locale is the plugin's one async
// identity accessor, so it is prefetched once and cached for the synchronous getInfo seam. Writes into
// caller-owned `out` so callers control allocation.
export function createTauriPlatformBackend(tauri: TauriApi): PlatformBackend {
  const os = tauri.os;
  let cachedLocale = '';
  os.locale()
    .then((locale) => {
      cachedLocale = locale ?? '';
    })
    .catch(() => {
      /* leave '' */
    });
  return createEntity<EntityWithoutRuntime<PlatformBackend>>({
    getInfo(out) {
      out.name = toPlatformName(os.platform());
      out.kind = 'desktop';
      out.version = os.version();
      out.arch = os.arch();
      out.locale = cachedLocale;
      out.isTouch = false;
      out.runtime = 'tauri';
      return out;
    },
  } satisfies EntityWithoutRuntime<PlatformBackend>);
}

function toPlatformName(platform: string): PlatformName {
  if (platform === 'windows') return 'windows';
  if (platform === 'macos') return 'macos';
  if (platform === 'linux') return 'linux';
  if (platform === 'ios') return 'ios';
  if (platform === 'android') return 'android';
  return 'unknown';
}

import { getAppBackend } from '@flighthq/app/contract';
import { getConnectivityBackend } from '@flighthq/connectivity/contract';
import { getDeviceBackend } from '@flighthq/device/contract';
import { getFileSystemBackend } from '@flighthq/filesystem/contract';
import { getGeolocationBackend } from '@flighthq/geolocation/contract';
import { getGlyphRasterizerBackend } from '@flighthq/glyphatlas/contract';
import { getIpcBackend } from '@flighthq/ipc/contract';
import { getSoftKeyboardBackend } from '@flighthq/keyboard/contract';
import { getPlatformBackend } from '@flighthq/platform/contract';
import { getPowerBackend } from '@flighthq/power/contract';
import { getProtocolBackend } from '@flighthq/protocol/contract';
import { getScreenBackend } from '@flighthq/screen/contract';
import { getShareBackend } from '@flighthq/share/contract';
import { getShellBackend } from '@flighthq/shell/contract';
import { getShortcutBackend } from '@flighthq/shortcut/contract';
import { getStatusBarBackend } from '@flighthq/statusbar/contract';
import { getStorageBackend } from '@flighthq/storage/contract';
import { getTrayBackend } from '@flighthq/tray/contract';
import type { Host } from '@flighthq/types/contract';
import { getUpdaterBackend } from '@flighthq/updater/contract';

import type { HostProbeCapability } from './expectations';

export type HostProbeBackendSnapshot = Readonly<Record<HostProbeCapability, unknown>>;

export function captureHostProbeBackends(
  host: Partial<Pick<Host, 'app' | 'clipboard' | 'dialog' | 'input' | 'menu' | 'notification' | 'window'>> = {},
): HostProbeBackendSnapshot {
  return {
    app: getAppBackend(),
    clipboard: host.clipboard?.text ?? null,
    connectivity: getConnectivityBackend(),
    cursor: null,
    device: getDeviceBackend(),
    dialog: host.dialog ?? null,
    filesystem: getFileSystemBackend(),
    geolocation: getGeolocationBackend(),
    'glyph-rasterizer': getGlyphRasterizerBackend(),
    haptics: host.input?.haptics ?? null,
    ipc: getIpcBackend(),
    loop: host.app?.loop ?? null,
    menu: host.menu ?? null,
    notification: host.notification ?? null,
    platform: getPlatformBackend(),
    power: getPowerBackend(),
    protocol: getProtocolBackend(),
    screen: getScreenBackend(),
    share: getShareBackend(),
    shell: getShellBackend(),
    shortcut: getShortcutBackend(),
    'soft-keyboard': getSoftKeyboardBackend(),
    statusbar: getStatusBarBackend(),
    storage: getStorageBackend(),
    tray: getTrayBackend(),
    updater: getUpdaterBackend(),
    window: host.window ?? null,
  };
}

export function diffHostProbeBackends(
  before: HostProbeBackendSnapshot,
  after: HostProbeBackendSnapshot,
): HostProbeCapability[] {
  const changed: HostProbeCapability[] = [];
  for (const capability of Object.keys(before) as HostProbeCapability[]) {
    if (before[capability] !== after[capability]) changed.push(capability);
  }
  return changed;
}

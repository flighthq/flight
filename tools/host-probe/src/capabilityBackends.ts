import { getAppBackend } from '@flighthq/app/contract';
import { getLoopBackend } from '@flighthq/application/contract';
import { getClipboardBackend } from '@flighthq/clipboard/contract';
import { getConnectivityBackend } from '@flighthq/connectivity/contract';
import { getDeviceBackend } from '@flighthq/device/contract';
import { getDialogBackend } from '@flighthq/dialog/contract';
import { getFileSystemBackend } from '@flighthq/filesystem/contract';
import { getGeolocationBackend } from '@flighthq/geolocation/contract';
import { getGlyphRasterizerBackend } from '@flighthq/glyphatlas/contract';
import { getHapticsBackend } from '@flighthq/haptics/contract';
import { getIpcBackend } from '@flighthq/ipc/contract';
import { getSoftKeyboardBackend } from '@flighthq/keyboard/contract';
import { getMenuBackend } from '@flighthq/menu/contract';
import { getNotificationBackend } from '@flighthq/notification/contract';
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
import { getUpdaterBackend } from '@flighthq/updater/contract';

import type { HostProbeCapability } from './expectations';

export type HostProbeBackendSnapshot = Readonly<Record<HostProbeCapability, unknown>>;

export function captureHostProbeBackends(windowBackend: unknown = null): HostProbeBackendSnapshot {
  return {
    app: getAppBackend(),
    clipboard: getClipboardBackend(),
    connectivity: getConnectivityBackend(),
    cursor: null,
    device: getDeviceBackend(),
    dialog: getDialogBackend(),
    filesystem: getFileSystemBackend(),
    geolocation: getGeolocationBackend(),
    'glyph-rasterizer': getGlyphRasterizerBackend(),
    haptics: getHapticsBackend(),
    ipc: getIpcBackend(),
    loop: getLoopBackend(),
    menu: getMenuBackend(),
    notification: getNotificationBackend(),
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
    window: windowBackend,
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

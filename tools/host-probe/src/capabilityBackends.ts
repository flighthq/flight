import { getAppBackend } from '@flighthq/app/contract';
import { getDeviceBackend } from '@flighthq/device/contract';
import { getFileSystemBackend } from '@flighthq/filesystem/contract';
import { getGeolocationBackend } from '@flighthq/geolocation/contract';
import { getGlyphRasterizerBackend } from '@flighthq/glyphatlas/contract';
import { getPlatformBackend } from '@flighthq/platform/contract';
import { getProtocolBackend } from '@flighthq/protocol/contract';
import { getShortcutBackend } from '@flighthq/shortcut/contract';
import { getStatusBarBackend } from '@flighthq/statusbar/contract';
import { getTrayBackend } from '@flighthq/tray/contract';
import type { Host } from '@flighthq/types/contract';

import type { HostProbeCapability } from './expectations';

export type HostProbeBackendSnapshot = Readonly<Record<HostProbeCapability, unknown>>;

export function captureHostProbeBackends(
  host: Partial<
    Pick<
      Host,
      | 'accessibility'
      | 'app'
      | 'clipboard'
      | 'connectivity'
      | 'dialog'
      | 'input'
      | 'ipc'
      | 'menu'
      | 'notification'
      | 'power'
      | 'screen'
      | 'share'
      | 'shell'
      | 'storage'
      | 'updater'
      | 'window'
    >
  > = {},
): HostProbeBackendSnapshot {
  return {
    accessibility: host.accessibility?.provider ?? null,
    app: getAppBackend(),
    clipboard: host.clipboard?.text ?? null,
    connectivity: host.connectivity?.status ?? null,
    cursor: null,
    device: getDeviceBackend(),
    dialog: host.dialog ?? null,
    filesystem: getFileSystemBackend(),
    geolocation: getGeolocationBackend(),
    'glyph-rasterizer': getGlyphRasterizerBackend(),
    haptics: host.input?.haptics ?? null,
    ipc: host.ipc ?? null,
    loop: host.app?.loop ?? null,
    menu: host.menu ?? null,
    notification: host.notification ?? null,
    platform: getPlatformBackend(),
    power: host.power ?? null,
    protocol: getProtocolBackend(),
    screen: host.screen?.query ?? null,
    share: host.share?.content ?? host.share?.files ?? null,
    shell:
      host.shell?.external ??
      host.shell?.pathOpen ??
      host.shell?.pathReveal ??
      host.shell?.trash ??
      host.shell?.shortcutLink ??
      host.shell?.beep ??
      null,
    shortcut: getShortcutBackend(),
    'soft-keyboard':
      host.input?.softKeyboardInfo ??
      host.input?.softKeyboardChange ??
      host.input?.softKeyboardVisibility ??
      host.input?.softKeyboardResizeModeWrite ??
      host.input?.softKeyboardStyle ??
      host.input?.softKeyboardAccessoryBar ??
      host.input?.softKeyboardScrollAssist ??
      null,
    statusbar: getStatusBarBackend(),
    storage: host.storage?.local ?? null,
    tray: getTrayBackend(),
    updater: host.updater?.command ?? null,
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

import { getAppBackend } from '@flighthq/app/contract';
import { getDeviceBackend } from '@flighthq/device/contract';
import { getFileSystemBackend } from '@flighthq/filesystem/contract';
import { getGeolocationBackend } from '@flighthq/geolocation/contract';
import { getGlyphRasterizerBackend } from '@flighthq/glyphatlas/contract';
import { getPlatformBackend } from '@flighthq/platform/contract';
import { getProtocolBackend } from '@flighthq/protocol/contract';
import { getStatusBarBackend } from '@flighthq/statusbar/contract';
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
      | 'shortcut'
      | 'storage'
      | 'tray'
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
    ipc: firstProvidedSlot(host.ipc),
    loop: host.app?.loop ?? null,
    menu: firstProvidedSlot(host.menu),
    notification: host.notification ?? null,
    platform: getPlatformBackend(),
    power: firstProvidedSlot(host.power),
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
    shortcut: host.shortcut?.trigger ?? host.shortcut?.query ?? null,
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
    tray: firstProvidedSlot(host.tray),
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

// Required capability groups remain `{}` on hosts without a provider. The group object itself is
// therefore not availability evidence; only a populated slot is.
function firstProvidedSlot(group: object | undefined): unknown {
  if (group === undefined) return null;
  for (const value of Object.values(group)) {
    if (value !== undefined) return value;
  }
  return null;
}

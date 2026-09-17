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
      | 'device'
      | 'dialog'
      | 'fileSystem'
      | 'geolocation'
      | 'haptics'
      | 'ipc'
      | 'menu'
      | 'notification'
      | 'platform'
      | 'power'
      | 'preferences'
      | 'protocol'
      | 'screen'
      | 'share'
      | 'shell'
      | 'shortcut'
      | 'softKeyboard'
      | 'statusBar'
      | 'tray'
      | 'updater'
      | 'window'
    >
  > = {},
  extras?: Readonly<{ glyphRasterizer?: unknown }>,
): HostProbeBackendSnapshot {
  return {
    accessibility: host.accessibility?.tree ?? null,
    app: firstProvidedSlot(host.app),
    clipboard: host.clipboard?.text ?? null,
    connectivity: host.connectivity?.status ?? null,
    cursor: null,
    device: host.device?.info ?? null,
    dialog: host.dialog ?? null,
    filesystem: host.fileSystem?.access ?? null,
    geolocation: host.geolocation?.position ?? null,
    'glyph-rasterizer': extras?.glyphRasterizer ?? null,
    haptics: host.haptics?.engine ?? null,
    ipc: firstProvidedSlot(host.ipc),
    loop: host.app?.loop ?? null,
    menu: firstProvidedSlot(host.menu),
    'notification.action': host.notification?.action ?? null,
    'notification.activeList': host.notification?.activeList ?? null,
    'notification.click': host.notification?.click ?? null,
    'notification.close': host.notification?.close ?? null,
    'notification.delivery': host.notification?.delivery ?? null,
    'notification.dismiss': host.notification?.dismiss ?? null,
    'notification.lifecycle': host.notification?.lifecycle ?? null,
    'notification.permission': host.notification?.permission ?? null,
    'notification.received': host.notification?.received ?? null,
    'notification.reply': host.notification?.reply ?? null,
    'notification.scheduling': host.notification?.scheduling ?? null,
    platform: host.platform?.info ?? null,
    power: firstProvidedSlot(host.power),
    protocol: firstProvidedSlot(host.protocol),
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
      host.softKeyboard?.info ??
      host.softKeyboard?.change ??
      host.softKeyboard?.visibility ??
      host.softKeyboard?.resizeModeWrite ??
      host.softKeyboard?.style ??
      host.softKeyboard?.accessoryBar ??
      host.softKeyboard?.scrollAssist ??
      null,
    statusbar:
      host.statusBar?.info ??
      host.statusBar?.color ??
      host.statusBar?.style ??
      host.statusBar?.visibility ??
      host.statusBar?.overlays ??
      host.statusBar?.change ??
      null,
    storage: host.preferences?.local ?? null,
    tray: firstProvidedSlot(host.tray),
    updater: host.updater?.command ?? null,
    window: firstProvidedSlot(host.window),
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

// Capability groups remain `{}` on hosts without a provider. The group object itself is
// therefore not availability evidence; only a populated slot is.
function firstProvidedSlot(group: object | undefined): unknown {
  if (group === undefined) return null;
  for (const value of Object.values(group)) {
    if (value !== undefined) return value;
  }
  return null;
}

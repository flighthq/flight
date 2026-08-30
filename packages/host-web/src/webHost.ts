import { createHost } from '@flighthq/entity/contract';
import type { EntityRuntimeKey, Host } from '@flighthq/types/contract';

import { webAccessibilityHost } from './webAccessibilityHost';
import { createWebAppCapabilities } from './webApp';
import { webApplicationExitBackend } from './webApplicationExit';
import { webClipboardHost } from './webClipboardHost';
import { webConnectivityHost } from './webConnectivityHost';
import { webDeviceBackend } from './webDevice';
import { webDialogHost } from './webDialogHost';
import { webFileSystemBackend } from './webFilesystem';
import { webGraphicsHost } from './webGraphicsHost';
import { webInputHost } from './webInputHost';
import { webLifecycleBackend } from './webLifecycle';
import { webApplicationVisibilityBackend, webLoopBackend } from './webLoop';
import { webMediaSessionActionBackend, webMediaSessionBackend } from './webMediasession';
import { webMenuHost } from './webMenuHost';
import { webNetBackend } from './webNet';
import { webPlatformBackend } from './webPlatform';
import { webPowerCapabilities } from './webPower';
import { createWebProtocolCapabilities } from './webProtocol';
import { webScreenCapabilities } from './webScreen';
import { webSensorsBackend } from './webSensors';
import { webShareHost } from './webShareHost';
import { webShellHost } from './webShellHost';
import { webSocketBackend } from './webSocket';
import { webStatusBarColorBackend } from './webStatusbar';
import { webStorageBackend } from './webStorage';
import { createWebWindowStoragePersistenceCapabilities } from './webStoragePersistence';
import { webFullscreenBackend, webWindowBackend } from './webWindow';

const webStoragePersistenceCapabilities = createWebWindowStoragePersistenceCapabilities({
  async getPermissionState() {
    const status = await navigator.permissions.query({ name: 'persistent-storage' as PermissionName });
    return status.state;
  },
  async persist() {
    return navigator.storage.persist();
  },
  async persisted() {
    return navigator.storage.persisted();
  },
});
const webAppCapabilities = createWebAppCapabilities();
const webProtocolCapabilities = createWebProtocolCapabilities();

// The explicit web host grows capability-by-capability as ambient backend domains migrate. Empty
// groups are intentional: they preserve Host's stable two-level shape without claiming providers that
// still live behind the legacy registration path.
export const webHost = createHost({
  accessibility: webAccessibilityHost.accessibility,
  app: {
    ...webAppCapabilities,
    exit: webApplicationExitBackend,
    loop: webLoopBackend,
    visibility: webApplicationVisibilityBackend,
  },
  clipboard: webClipboardHost.clipboard,
  connectivity: webConnectivityHost.connectivity,
  dialog: webDialogHost.dialog,
  graphics: webGraphicsHost.graphics,
  input: webInputHost.input,
  // No IPC provider: a browser page has no inter-process peer to receive channel messages from.
  ipc: {},
  media: {
    session: webMediaSessionBackend,
    sessionAction: webMediaSessionActionBackend,
  },
  menu: webMenuHost.menu,
  // MIDI access may prompt and enumerate hardware, so only the injected profile factories claim it.
  midi: {},
  net: { http: webNetBackend, socket: webSocketBackend },
  power: webPowerCapabilities,
  protocol: webProtocolCapabilities,
  // Notification construction is execution-context-specific (page vs Service Worker) and requires an
  // injected API. Compose one of the exported notification factories into a Host deliberately.
  notification: {},
  screen: webScreenCapabilities,
  share: webShareHost.share,
  shell: webShellHost.shell,
  // Browsers cannot register OS-global shortcuts; structural absence is the complete capability truth.
  shortcut: {},
  storage: {
    change: webStorageBackend,
    fileSystem: webFileSystemBackend,
    local: webStorageBackend,
    persistenceQuery: webStoragePersistenceCapabilities.persistenceQuery,
    persistenceRequest: webStoragePersistenceCapabilities.persistenceRequest,
  },
  system: {
    device: webDeviceBackend,
    lifecycle: webLifecycleBackend,
    platform: webPlatformBackend,
    sensors: webSensorsBackend,
  },
  text: {},
  tray: {},
  ui: { fullscreen: webFullscreenBackend, statusBarColor: webStatusBarColorBackend },
  updater: {},
  window: webWindowBackend,
} as const satisfies Omit<Host, typeof EntityRuntimeKey>);

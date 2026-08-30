import { createEntity } from '@flighthq/entity/contract';
import type { EntityRuntimeKey, Host } from '@flighthq/types/contract';

import { webAccessibilityBackend } from './webAccessibility';
import { createWebAppCapabilities } from './webApp';
import { webApplicationExitBackend } from './webApplicationExit';
import { webClipboardBackend } from './webClipboard';
import { webConnectivityBackend } from './webConnectivity';
import {
  webDirectoryOpenDialogBackend,
  webFileOpenDialogBackend,
  webFileSaveDialogBackend,
  webMessageDialogBackend,
  webPromptDialogBackend,
} from './webDialog';
import { webHapticsBackend } from './webHaptics';
import {
  webInputDropFileBackend,
  webInputFocusBackend,
  webInputPointerLockBackend,
  webInputTargetBackend,
  webRenderContextBackend,
  webRenderSurfaceBackend,
} from './webInputTarget';
import {
  createWebSoftKeyboardChangeBackend,
  createWebSoftKeyboardInfoBackend,
  createWebSoftKeyboardVisibilityBackend,
} from './webKeyboard';
import { webLifecycleBackend } from './webLifecycle';
import { webApplicationVisibilityBackend, webLoopBackend } from './webLoop';
import { webMediaSessionActionBackend, webMediaSessionBackend } from './webMediasession';
import { webMenuHighlightBackend, webMenuPopupBackend } from './webMenu';
import { webPowerCapabilities } from './webPower';
import { createWebProtocolCapabilities } from './webProtocol';
import { webScreenCapabilities } from './webScreen';
import { webShareContentBackend, webShareFilesBackend } from './webShare';
import { webShellExternalBackend } from './webShell';
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
export const webHost = createEntity({
  accessibility: { provider: webAccessibilityBackend },
  app: {
    ...webAppCapabilities,
    exit: webApplicationExitBackend,
    loop: webLoopBackend,
    visibility: webApplicationVisibilityBackend,
  },
  clipboard: {
    change: webClipboardBackend,
    formats: webClipboardBackend,
    image: webClipboardBackend,
    text: webClipboardBackend,
  },
  connectivity: {
    change: webConnectivityBackend,
    reachability: webConnectivityBackend,
    status: webConnectivityBackend,
  },
  dialog: {
    directoryOpen: webDirectoryOpenDialogBackend,
    fileOpen: webFileOpenDialogBackend,
    fileSave: webFileSaveDialogBackend,
    message: webMessageDialogBackend,
    prompt: webPromptDialogBackend,
  },
  graphics: {
    renderContext: webRenderContextBackend,
    renderSurface: webRenderSurfaceBackend,
  },
  input: {
    dropFile: webInputDropFileBackend,
    focus: webInputFocusBackend,
    haptics: webHapticsBackend,
    pointerLock: webInputPointerLockBackend,
    softKeyboardChange: createWebSoftKeyboardChangeBackend(),
    softKeyboardInfo: createWebSoftKeyboardInfoBackend(),
    softKeyboardVisibility: createWebSoftKeyboardVisibilityBackend(),
    target: webInputTargetBackend,
  },
  // No IPC provider: a browser page has no inter-process peer to receive channel messages from.
  ipc: {},
  media: {
    session: webMediaSessionBackend,
    sessionAction: webMediaSessionActionBackend,
  },
  menu: { highlight: webMenuHighlightBackend, popup: webMenuPopupBackend },
  // MIDI access may prompt and enumerate hardware, so only the injected profile factories claim it.
  midi: {},
  net: {},
  power: webPowerCapabilities,
  protocol: webProtocolCapabilities,
  // Notification construction is execution-context-specific (page vs Service Worker) and requires an
  // injected API. Compose one of the exported notification factories into a Host deliberately.
  notification: {},
  screen: webScreenCapabilities,
  share: { content: webShareContentBackend, files: webShareFilesBackend },
  shell: { external: webShellExternalBackend },
  // Browsers cannot register OS-global shortcuts; structural absence is the complete capability truth.
  shortcut: {},
  storage: {
    change: webStorageBackend,
    local: webStorageBackend,
    persistenceQuery: webStoragePersistenceCapabilities.persistenceQuery,
    persistenceRequest: webStoragePersistenceCapabilities.persistenceRequest,
  },
  system: { lifecycle: webLifecycleBackend },
  text: {},
  tray: {},
  ui: { fullscreen: webFullscreenBackend },
  updater: {},
  window: webWindowBackend,
} as const satisfies Omit<Host, typeof EntityRuntimeKey>);

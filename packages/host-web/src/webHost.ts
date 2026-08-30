import { createEntity } from '@flighthq/entity/contract';
import type { EntityRuntimeKey, Host } from '@flighthq/types/contract';

import { webAccessibilityBackend } from './webAccessibility';
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
import { webApplicationVisibilityBackend, webLoopBackend } from './webLoop';
import { webMediaSessionActionBackend, webMediaSessionBackend } from './webMediasession';
import { webMenuHighlightBackend, webMenuPopupBackend } from './webMenu';
import { webPowerCapabilities } from './webPower';
import { webScreenCapabilities } from './webScreen';
import { webShareContentBackend, webShareFilesBackend } from './webShare';
import { webShellExternalBackend } from './webShell';
import { webStorageBackend } from './webStorage';
import { webFullscreenBackend, webWindowBackend } from './webWindow';

// The explicit web host grows capability-by-capability as ambient backend domains migrate. Empty
// groups are intentional: they preserve Host's stable two-level shape without claiming providers that
// still live behind the legacy registration path.
export const webHost = createEntity({
  accessibility: { provider: webAccessibilityBackend },
  app: {
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
  net: {},
  power: webPowerCapabilities,
  // Notification construction is execution-context-specific (page vs Service Worker) and requires an
  // injected API. Compose one of the exported notification factories into a Host deliberately.
  notification: {},
  screen: webScreenCapabilities,
  share: { content: webShareContentBackend, files: webShareFilesBackend },
  shell: { external: webShellExternalBackend },
  // Browsers cannot register OS-global shortcuts; structural absence is the complete capability truth.
  shortcut: {},
  storage: { change: webStorageBackend, local: webStorageBackend },
  system: {},
  text: {},
  tray: {},
  ui: { fullscreen: webFullscreenBackend },
  updater: {},
  window: webWindowBackend,
} as const satisfies Omit<Host, typeof EntityRuntimeKey>);

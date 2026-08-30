import { createEntity } from '@flighthq/entity/contract';
import { webNotificationCapabilities } from '@flighthq/notification/contract';
import type { EntityRuntimeKey, Host } from '@flighthq/types/contract';

import { webAccessibilityBackend } from './webAccessibility';
import { webApplicationExitBackend } from './webApplicationExit';
import { webClipboardBackend } from './webClipboard';
import { webConnectivityBackend } from './webConnectivity';
import { webFileDialogBackend, webMessageDialogBackend, webPromptDialogBackend } from './webDialog';
import { webHapticsBackend } from './webHaptics';
import {
  webInputDropFileBackend,
  webInputFocusBackend,
  webInputPointerLockBackend,
  webInputTargetBackend,
  webRenderContextBackend,
  webRenderSurfaceBackend,
} from './webInputTarget';
import { webApplicationVisibilityBackend, webLoopBackend } from './webLoop';
import { webMediaSessionActionBackend, webMediaSessionBackend } from './webMediasession';
import { webMenuHighlightBackend, webMenuPopupBackend } from './webMenu';
import { webPowerCapabilities } from './webPower';
import { webScreenCapabilities } from './webScreen';
import { webShareContentBackend, webShareFilesBackend } from './webShare';
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
    file: webFileDialogBackend,
    message: webMessageDialogBackend,
    prompt: webPromptDialogBackend,
  },
  graphics: { renderContext: webRenderContextBackend, renderSurface: webRenderSurfaceBackend },
  input: {
    dropFile: webInputDropFileBackend,
    focus: webInputFocusBackend,
    haptics: webHapticsBackend,
    pointerLock: webInputPointerLockBackend,
    target: webInputTargetBackend,
  },
  media: { session: webMediaSessionBackend, sessionAction: webMediaSessionActionBackend },
  menu: { highlight: webMenuHighlightBackend, popup: webMenuPopupBackend },
  net: {},
  power: webPowerCapabilities,
  notification: webNotificationCapabilities,
  screen: webScreenCapabilities,
  share: { content: webShareContentBackend, files: webShareFilesBackend },
  storage: { change: webStorageBackend, local: webStorageBackend },
  system: {},
  text: {},
  ui: { fullscreen: webFullscreenBackend },
  window: webWindowBackend,
} as const satisfies Omit<Host, typeof EntityRuntimeKey>);

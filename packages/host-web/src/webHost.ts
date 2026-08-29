import { createEntity } from '@flighthq/entity/contract';
import { webNotificationCapabilities } from '@flighthq/notification/contract';
import type { EntityRuntimeKey, Host } from '@flighthq/types/contract';

import { webApplicationExitBackend } from './webApplicationExit';
import { webClipboardBackend } from './webClipboard';
import { webFileDialogBackend, webMessageDialogBackend, webPromptDialogBackend } from './webDialog';
import { webHapticsBackend } from './webHaptics';
import { webApplicationVisibilityBackend, webLoopBackend } from './webLoop';
import { webFullscreenBackend, webWindowBackend } from './webWindow';

// The explicit web host grows capability-by-capability as ambient backend domains migrate. Empty
// groups are intentional: they preserve Host's stable two-level shape without claiming providers that
// still live behind the legacy registration path.
export const webHost = createEntity({
  accessibility: {},
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
  dialog: {
    file: webFileDialogBackend,
    message: webMessageDialogBackend,
    prompt: webPromptDialogBackend,
  },
  graphics: {},
  input: { haptics: webHapticsBackend },
  media: {},
  net: {},
  notification: webNotificationCapabilities,
  storage: {},
  system: {},
  text: {},
  ui: { fullscreen: webFullscreenBackend },
  window: webWindowBackend,
} as const satisfies Omit<Host, typeof EntityRuntimeKey>);

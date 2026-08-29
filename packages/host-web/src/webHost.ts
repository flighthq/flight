import type { Host } from '@flighthq/types/contract';

import { webApplicationExitBackend } from './webApplicationExit';
import { webFileDialogBackend, webMessageDialogBackend, webPromptDialogBackend } from './webDialog';
import { webHapticsBackend } from './webHaptics';
import { webFullscreenBackend, webWindowBackend } from './webWindow';

// The explicit web host grows capability-by-capability as ambient backend domains migrate. Empty
// groups are intentional: they preserve Host's stable two-level shape without claiming providers that
// still live behind the legacy registration path.
export const webHost = {
  accessibility: {},
  app: { exit: webApplicationExitBackend },
  dialog: {
    file: webFileDialogBackend,
    message: webMessageDialogBackend,
    prompt: webPromptDialogBackend,
  },
  graphics: {},
  input: { haptics: webHapticsBackend },
  media: {},
  net: {},
  storage: {},
  system: {},
  text: {},
  ui: { fullscreen: webFullscreenBackend },
  window: webWindowBackend,
} as const satisfies Host;

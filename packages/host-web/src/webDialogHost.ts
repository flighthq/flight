import { createHost } from '@flighthq/entity/contract';
import type {
  HasDialogDirectoryOpen,
  HasDialogFileOpen,
  HasDialogFileSave,
  HasDialogMessage,
  HasDialogPrompt,
  Host,
} from '@flighthq/types/contract';

import {
  webDirectoryOpenDialogBackend,
  webFileOpenDialogBackend,
  webFileSaveDialogBackend,
  webMessageDialogBackend,
  webPromptDialogBackend,
} from './webDialog';

export const webDialogHost: Host &
  HasDialogDirectoryOpen &
  HasDialogFileOpen &
  HasDialogFileSave &
  HasDialogMessage &
  HasDialogPrompt = createHost({
  dialog: {
    directoryOpen: webDirectoryOpenDialogBackend,
    fileOpen: webFileOpenDialogBackend,
    fileSave: webFileSaveDialogBackend,
    message: webMessageDialogBackend,
    prompt: webPromptDialogBackend,
  },
});

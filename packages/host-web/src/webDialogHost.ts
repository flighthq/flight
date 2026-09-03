import { createHost } from '@flighthq/entity/contract';
import type {
  HasDialogDirectoryOpen,
  HasDialogFileOpen,
  HasDialogFileSave,
  HasDialogImageOpen,
  HasDialogMessage,
  HasDialogPhotoCapture,
  HasDialogPrompt,
  HasDialogVideoCapture,
  Host,
} from '@flighthq/types/contract';

import {
  webDirectoryOpenDialogBackend,
  webFileOpenDialogBackend,
  webFileSaveDialogBackend,
  webImageOpenDialogBackend,
  webMessageDialogBackend,
  webPhotoCaptureDialogBackend,
  webPromptDialogBackend,
  webVideoCaptureDialogBackend,
} from './webDialog';

export const webDialogHost: Host &
  HasDialogDirectoryOpen &
  HasDialogFileOpen &
  HasDialogFileSave &
  HasDialogImageOpen &
  HasDialogMessage &
  HasDialogPhotoCapture &
  HasDialogPrompt &
  HasDialogVideoCapture = createHost({
  dialog: {
    directoryOpen: webDirectoryOpenDialogBackend,
    fileOpen: webFileOpenDialogBackend,
    fileSave: webFileSaveDialogBackend,
    imageOpen: webImageOpenDialogBackend,
    message: webMessageDialogBackend,
    photoCapture: webPhotoCaptureDialogBackend,
    prompt: webPromptDialogBackend,
    videoCapture: webVideoCaptureDialogBackend,
  },
});

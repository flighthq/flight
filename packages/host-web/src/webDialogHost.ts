import type { HostDialogCapabilities } from '@flighthq/types/contract';

import {
  webHostDirectoryOpenDialog,
  webHostFileOpenDialog,
  webHostFileSaveDialog,
  webHostImageOpenDialog,
  webHostMessageDialog,
  webHostPhotoCaptureDialog,
  webHostPromptDialog,
  webHostVideoCaptureDialog,
} from './webDialog';

export const webHostDialog = {
  directoryOpen: webHostDirectoryOpenDialog,
  fileOpen: webHostFileOpenDialog,
  fileSave: webHostFileSaveDialog,
  imageOpen: webHostImageOpenDialog,
  message: webHostMessageDialog,
  photoCapture: webHostPhotoCaptureDialog,
  prompt: webHostPromptDialog,
  videoCapture: webHostVideoCaptureDialog,
} satisfies HostDialogCapabilities;

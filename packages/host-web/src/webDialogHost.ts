import type { HostDialogCapabilities } from '@flighthq/host/contract';

import {
  webHostDirectoryOpenDialog,
  webHostFileOpenDialog,
  webHostFileSaveDialog,
  webHostImageOpenDialog,
  webHostMessageDialog,
  webHostPhotoCaptureDialog,
  webHostPromptDialog,
  webHostVideoCaptureDialog,
} from './webDialog.ts';

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

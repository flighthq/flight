import type { CapturePhotoDialogOptions, PhotoCaptureDialogResult } from './Dialog.ts';

export interface HostPhotoCaptureDialogCapability {
  capture(options?: Readonly<CapturePhotoDialogOptions>): Promise<PhotoCaptureDialogResult>;
}

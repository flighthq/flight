import type { CapturePhotoDialogOptions, PhotoCaptureDialogResult } from './Dialog';

export interface HostPhotoCaptureDialogCapability {
  capture(options?: Readonly<CapturePhotoDialogOptions>): Promise<PhotoCaptureDialogResult>;
}

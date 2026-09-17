import type { CapturePhotoDialogOptions, PhotoCaptureDialogResult } from './Dialog';
import type { Entity } from './Entity';

export interface HostPhotoCaptureDialogCapability extends Entity {
  capture(options?: Readonly<CapturePhotoDialogOptions>): Promise<PhotoCaptureDialogResult>;
}

import type { CaptureVideoDialogOptions, VideoCaptureDialogResult } from './Dialog';
import type { Entity } from './Entity';

export interface HostVideoCaptureDialogCapability extends Entity {
  capture(options?: Readonly<CaptureVideoDialogOptions>): Promise<VideoCaptureDialogResult>;
}

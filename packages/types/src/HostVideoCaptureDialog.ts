import type { CaptureVideoDialogOptions, VideoCaptureDialogResult } from './Dialog';

export interface HostVideoCaptureDialogCapability {
  capture(options?: Readonly<CaptureVideoDialogOptions>): Promise<VideoCaptureDialogResult>;
}

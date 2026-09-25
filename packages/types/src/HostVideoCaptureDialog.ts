import type { CaptureVideoDialogOptions, VideoCaptureDialogResult } from './Dialog.ts';

export interface HostVideoCaptureDialogCapability {
  capture(options?: Readonly<CaptureVideoDialogOptions>): Promise<VideoCaptureDialogResult>;
}

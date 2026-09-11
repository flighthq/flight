import type {
  CapturePhotoDialogOptions,
  CaptureVideoDialogOptions,
  HostImageOpenDialogProvider,
  HostPhotoCaptureDialogProvider,
  HostVideoCaptureDialogProvider,
  ImageOpenDialogResult,
  OpenImageDialogOptions,
  PhotoCaptureDialogResult,
  VideoCaptureDialogResult,
} from '@flighthq/types/contract';

export function showCapturePhotoDialog(
  hostPhotoCaptureDialog: Readonly<HostPhotoCaptureDialogProvider>,
  options?: Readonly<CapturePhotoDialogOptions>,
): Promise<PhotoCaptureDialogResult> {
  return options === undefined ? hostPhotoCaptureDialog.capture() : hostPhotoCaptureDialog.capture(options);
}

export function showCaptureVideoDialog(
  hostVideoCaptureDialog: Readonly<HostVideoCaptureDialogProvider>,
  options?: Readonly<CaptureVideoDialogOptions>,
): Promise<VideoCaptureDialogResult> {
  return options === undefined ? hostVideoCaptureDialog.capture() : hostVideoCaptureDialog.capture(options);
}

export function showOpenImageDialog(
  hostImageOpenDialog: Readonly<HostImageOpenDialogProvider>,
  options?: Readonly<OpenImageDialogOptions>,
): Promise<ImageOpenDialogResult> {
  return options === undefined ? hostImageOpenDialog.open() : hostImageOpenDialog.open(options);
}

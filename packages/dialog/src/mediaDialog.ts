import type {
  CapturePhotoDialogOptions,
  CaptureVideoDialogOptions,
  HasDialogImageOpen,
  HasDialogPhotoCapture,
  HasDialogVideoCapture,
  ImageOpenDialogResult,
  OpenImageDialogOptions,
  PhotoCaptureDialogResult,
  VideoCaptureDialogResult,
} from '@flighthq/types/contract';

export function showCapturePhotoDialog(
  host: HasDialogPhotoCapture,
  options?: Readonly<CapturePhotoDialogOptions>,
): Promise<PhotoCaptureDialogResult> {
  return options === undefined ? host.dialog.photoCapture.capture() : host.dialog.photoCapture.capture(options);
}

export function showCaptureVideoDialog(
  host: HasDialogVideoCapture,
  options?: Readonly<CaptureVideoDialogOptions>,
): Promise<VideoCaptureDialogResult> {
  return options === undefined ? host.dialog.videoCapture.capture() : host.dialog.videoCapture.capture(options);
}

export function showOpenImageDialog(
  host: HasDialogImageOpen,
  options?: Readonly<OpenImageDialogOptions>,
): Promise<ImageOpenDialogResult> {
  return options === undefined ? host.dialog.imageOpen.open() : host.dialog.imageOpen.open(options);
}

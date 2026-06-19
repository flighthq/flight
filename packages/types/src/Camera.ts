// Camera seam. Free functions in @flighthq/camera delegate to the active CameraBackend (web default
// over a transient file input, or a native host's). capture resolves to null when the host denies,
// the user cancels, or the capability is absent rather than throwing — image capture is an
// expected-failure surface, not a programmer error.

export type CameraSource = 'camera' | 'photos' | 'prompt';

export interface CameraCaptureOptions {
  source?: CameraSource;
  quality?: number;
  allowEditing?: boolean;
  // Maximum recording length for video capture, in milliseconds; native hosts honor it.
  maxDurationMs?: number;
}

export interface CameraPhoto {
  dataURL: string;
  width: number;
  height: number;
  format: string;
}

export interface CameraVideo {
  dataURL: string;
  duration: number;
  format: string;
}

export interface CameraBackend {
  capture(options: Readonly<CameraCaptureOptions>): Promise<CameraPhoto | null>;
  captureVideo(options: Readonly<CameraCaptureOptions>): Promise<CameraVideo | null>;
  requestPermission(): Promise<boolean>;
}

// Webcam seam. Free functions in @flighthq/webcam delegate to the active WebcamBackend (web default
// over a transient file input, or a native host's). capture resolves to null when the host denies,
// the user cancels, or the capability is absent rather than throwing — image capture is an
// expected-failure surface, not a programmer error.

export type WebcamSource = 'camera' | 'photos' | 'prompt';

export interface WebcamCaptureOptions {
  source?: WebcamSource;
  quality?: number;
  allowEditing?: boolean;
  // Maximum recording length for video capture, in milliseconds; native hosts honor it.
  maxDurationMs?: number;
}

export interface WebcamPhoto {
  dataUrl: string;
  width: number;
  height: number;
  format: string;
}

export interface WebcamVideo {
  dataUrl: string;
  duration: number;
  format: string;
}

export interface WebcamBackend {
  capture(options: Readonly<WebcamCaptureOptions>): Promise<WebcamPhoto | null>;
  captureVideo(options: Readonly<WebcamCaptureOptions>): Promise<WebcamVideo | null>;
  requestPermission(): Promise<boolean>;
}

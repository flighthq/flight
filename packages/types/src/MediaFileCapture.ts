// Media file capture seam. Free functions in @flighthq/webcam delegate to the active
// MediaFileCaptureBackend (web default over a transient file input, or a native host's). capture
// resolves to null when the host denies, the user cancels, or the capability is absent rather than
// throwing — image capture is an expected-failure surface, not a programmer error.

export type MediaFileCaptureSource = 'camera' | 'photos';

export interface MediaFileCaptureOptions {
  source?: MediaFileCaptureSource;
  quality?: number;
  allowEditing?: boolean;
  // Maximum recording length for video capture, in milliseconds; native hosts honor it.
  maxDurationMs?: number;
}

export interface MediaFileCapturePhoto {
  dataUrl: string;
  width: number;
  height: number;
  format: string;
}

export interface MediaFileCaptureVideo {
  dataUrl: string;
  duration: number;
  format: string;
}

export interface MediaFileCaptureBackend {
  capture(options: Readonly<MediaFileCaptureOptions>): Promise<MediaFileCapturePhoto | null>;
  captureVideo(options: Readonly<MediaFileCaptureOptions>): Promise<MediaFileCaptureVideo | null>;
}

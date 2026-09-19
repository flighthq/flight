import type { HostImageSource, HostVideoCapability, VideoResourceLoadOptions } from '@flighthq/types/contract';

export const webHostVideo: HostVideoCapability = {
  addEndedListener: (element: HostImageSource, listener: () => void): void => {
    (element as HTMLVideoElement).addEventListener('ended', listener);
  },
  attachStream: (stream: unknown): HostImageSource | null => {
    const element = safeCreateVideoElement();
    if (element === null) return null;
    element.srcObject = stream as MediaProvider;
    return element;
  },
  canPlayType: (mimeType): boolean => {
    try {
      const result = document.createElement('video').canPlayType(mimeType);
      return result === 'maybe' || result === 'probably';
    } catch {
      return false;
    }
  },
  createVideoElement: (): HostImageSource | null => safeCreateVideoElement(),
  createObjectUrl: (data: Blob): string => URL.createObjectURL(data),
  getCurrentTime: (element: HostImageSource): number => (element as HTMLVideoElement).currentTime,
  getDuration: (element: HostImageSource): number => {
    const d = (element as HTMLVideoElement).duration;
    return d === d ? d : 0;
  },
  getHeight: (element: HostImageSource): number => {
    const video = element as HTMLVideoElement;
    return video.videoHeight ?? 0;
  },
  getLoop: (element: HostImageSource): boolean => (element as HTMLVideoElement).loop,
  getMuted: (element: HostImageSource): boolean => (element as HTMLVideoElement).muted,
  getPlaybackRate: (element: HostImageSource): number => (element as HTMLVideoElement).playbackRate,
  getVolume: (element: HostImageSource): number => (element as HTMLVideoElement).volume,
  getWidth: (element: HostImageSource): number => {
    const video = element as HTMLVideoElement;
    return video.videoWidth ?? 0;
  },
  isReady: (element: HostImageSource): boolean => {
    const video = element as HTMLVideoElement;
    return video.readyState >= HAVE_CURRENT_DATA;
  },
  loadUrl: (
    url: string,
    options?: Readonly<VideoResourceLoadOptions>,
    signal?: AbortSignal,
  ): Promise<HostImageSource> => {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const element = safeCreateVideoElement();
    if (element === null) return Promise.reject(new Error('No video element available'));
    return new Promise((resolve, reject) => {
      element.preload = (options?.preload ?? 'auto') as HTMLMediaElement['preload'];
      if (options?.crossOrigin !== undefined) element.crossOrigin = options.crossOrigin;
      if (options?.muted !== undefined) element.muted = options.muted;
      if (options?.playsInline !== undefined) element.playsInline = options.playsInline;
      const readyEvent = readinessEventName(options?.readiness);

      const onReady = (): void => {
        cleanup();
        resolve(element);
      };

      const onError = (): void => {
        cleanup();
        safeReleaseElement(element);
        reject(new Error(`Failed to load video: ${url}`));
      };

      const onAbort = (): void => {
        cleanup();
        safeReleaseElement(element);
        reject(signal!.reason);
      };

      const cleanup = (): void => {
        element.removeEventListener(readyEvent, onReady);
        element.removeEventListener('error', onError);
        if (signal !== undefined) signal.removeEventListener('abort', onAbort);
      };

      element.addEventListener(readyEvent, onReady, { once: true });
      element.addEventListener('error', onError, { once: true });
      if (signal !== undefined) signal.addEventListener('abort', onAbort, { once: true });

      element.src = url;
    });
  },
  pause: (element: HostImageSource): void => {
    (element as HTMLVideoElement).pause();
  },
  play: (element: HostImageSource): Promise<void> => (element as HTMLVideoElement).play(),
  releaseElement: (element: HostImageSource): void => {
    safeReleaseElement(element as HTMLVideoElement);
  },
  removeEndedListener: (element: HostImageSource, listener: () => void): void => {
    (element as HTMLVideoElement).removeEventListener('ended', listener);
  },
  revokeObjectUrl: (url: string): void => {
    URL.revokeObjectURL(url);
  },
  setCurrentTime: (element: HostImageSource, value: number): void => {
    (element as HTMLVideoElement).currentTime = value;
  },
  setLoop: (element: HostImageSource, value: boolean): void => {
    (element as HTMLVideoElement).loop = value;
  },
  setMuted: (element: HostImageSource, value: boolean): void => {
    (element as HTMLVideoElement).muted = value;
  },
  setPlaybackRate: (element: HostImageSource, value: number): void => {
    (element as HTMLVideoElement).playbackRate = value;
  },
  setVolume: (element: HostImageSource, value: number): void => {
    (element as HTMLVideoElement).volume = value;
  },
};

function readinessEventName(readiness: VideoResourceLoadOptions['readiness']): string {
  switch (readiness) {
    case 'metadata':
      return 'loadedmetadata';
    case 'canplaythrough':
      return 'canplaythrough';
    default:
      return 'canplay';
  }
}

function safeCreateVideoElement(): HTMLVideoElement | null {
  try {
    return document.createElement('video');
  } catch {
    return null;
  }
}

function safeReleaseElement(element: HTMLVideoElement): void {
  if (element.srcObject !== null) {
    element.srcObject = null;
  }
  element.removeAttribute('src');
  element.load();
}

// HTMLMediaElement.HAVE_CURRENT_DATA
const HAVE_CURRENT_DATA = 2;

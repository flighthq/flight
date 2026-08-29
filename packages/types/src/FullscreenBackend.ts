export type FullscreenTargetHandle = { readonly __brand: 'FullscreenTargetHandle' };

export interface FullscreenBackend {
  exit(): Promise<boolean>;
  request(target: FullscreenTargetHandle): Promise<boolean>;
  subscribe?(callback: (fullscreen: boolean) => void): void;
  unsubscribe?(callback: (fullscreen: boolean) => void): void;
}

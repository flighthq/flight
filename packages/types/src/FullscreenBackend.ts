import type { Entity } from './Entity';

export type FullscreenTargetHandle = Entity & { readonly __brand: 'FullscreenTargetHandle' };

export interface HostFullscreenProvider {
  exit(): Promise<boolean>;
  request(target: FullscreenTargetHandle): Promise<boolean>;
  subscribe?(callback: (fullscreen: boolean) => void): void;
  unsubscribe?(callback: (fullscreen: boolean) => void): void;
}

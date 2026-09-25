import type { Entity } from './Entity.ts';

export type FullscreenTargetHandle = Entity & { readonly __brand: 'FullscreenTargetHandle' };

export interface HostElementFullscreenCapability {
  exit(): Promise<boolean>;
  request(target: FullscreenTargetHandle): Promise<boolean>;
  subscribe?(callback: (fullscreen: boolean) => void): () => void;
}

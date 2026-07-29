import type { Texture } from './Texture';

// Read-only facts available while a registered extension selects its shader contribution.
export interface GlPbrExtensionShaderContext {
  hasTransmissionSceneColor(): boolean;
  isTextureReady(texture: Readonly<Texture> | null): boolean;
}

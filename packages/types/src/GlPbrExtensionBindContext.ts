import type { PbrUvSet } from './PbrExtension';
import type { Texture } from './Texture';

// Backend-safe operations exposed to a PBR extension binder. Extensions name their own uniforms but
// never receive the private GlPbrProgram record or raw uniform locations.
export interface GlPbrExtensionBindContext {
  bindTransmissionSceneColor(samplerUniform: string, maxLodUniform: string): boolean;
  bindTexture(
    samplerUniform: string,
    uvSetUniform: string,
    uvTransformUniform: string,
    texture: Readonly<Texture> | null,
    uvSet: PbrUvSet,
  ): boolean;
  setLinearColor(uniform: string, color: number): void;
  setFloat(uniform: string, value: number): void;
}

import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';
import type { Rectangle } from './Rectangle';
import type { TextureAtlas } from './TextureAtlas';

export interface ParticleEmitterData extends DisplayObjectData {
  alphas: Float32Array;
  atlas: TextureAtlas | null;
  colors: Float32Array; // [r, g, b] × capacity — interpolated from colorStart→colorEnd
  ids: Uint16Array;
  particleCount: number;
  // Z position per particle for 3D emitters. Kept separate from the 2D transform stride so existing
  // 2D renderers can ignore it without a stride change. Empty until a 3D emitter is reserved.
  positionsZ: Float32Array;
  transforms: Float32Array; // [x, y, rotation, scale] × capacity — 4 floats/particle
  // [vx, vy] × capacity — per-particle velocity in the same space/units as transforms positions, kept
  // aligned with transforms by updateParticleEmitter so the velocity G-buffer writer can smear each
  // particle by its own vector. Empty until the emitter is reserved.
  velocities: Float32Array;
  worldSpace: boolean; // when true, particle positions are world-space; renderers skip node transform
}

export interface ParticleEmitterRuntime extends DisplayObjectRuntime {
  localBoundsRectangle: Rectangle | null;
}

export interface ParticleEmitter extends DisplayObject {
  data: ParticleEmitterData;
}

export const ParticleEmitterKind = 'ParticleEmitter';

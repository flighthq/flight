import type { Rectangle } from './Rectangle';
import type { SpriteNode, SpriteNodeData, SpriteNodeRuntime } from './SpriteNode';
import type { TextureAtlas } from './TextureAtlas';

export interface ParticleEmitterData extends SpriteNodeData {
  alphas: Float32Array;
  atlas: TextureAtlas | null;
  ids: Uint16Array;
  particleCount: number;
  transforms: Float32Array; // [x, y, rotation, scale] × capacity — 4 floats/particle
}

export interface ParticleEmitterRuntime extends SpriteNodeRuntime {
  localBoundsRectangle: Rectangle | null;
}

export interface ParticleEmitter extends SpriteNode {
  data: ParticleEmitterData;
}

export const ParticleEmitterKind: unique symbol = Symbol('ParticleEmitter');

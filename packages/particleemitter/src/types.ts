import type { Rectangle } from '@flighthq/geometry/contract';
import type { ParticleBlendMode } from '@flighthq/particles/contract';
import type { Node2D, Node2DData, Node2DRuntime } from '@flighthq/scene2d/contract';
import type { Node3D, Node3DRuntime } from '@flighthq/scene3d/contract';
import type { TextureAtlas } from '@flighthq/textureatlas/contract';

export interface ParticleEmitterData extends Node2DData {
  alphas: Float32Array;
  atlas: TextureAtlas | null;
  colors: Float32Array;
  ids: Uint16Array;
  particleCount: number;
  positionsZ: Float32Array;
  transforms: Float32Array;
  velocities: Float32Array;
  worldSpace: boolean;
}

export interface ParticleEmitter2DRuntime extends Node2DRuntime {
  localBoundsRectangle: Rectangle | null;
}

export interface ParticleEmitter2D extends Node2D {
  data: ParticleEmitterData;
}

export const ParticleEmitter2DKind = 'ParticleEmitter2D';

export interface ParticleEmitter3D extends Node3D {
  blendMode: ParticleBlendMode;
  data: ParticleEmitterData;
}

export type ParticleEmitter3DRuntime = Node3DRuntime;

export const ParticleEmitter3DKind = 'ParticleEmitter3D';

export interface ParticleEmitterCallbacks {
  onDeath?: (x: number, y: number, z: number) => void;
  onSpawn?: (x: number, y: number, z: number) => void;
}

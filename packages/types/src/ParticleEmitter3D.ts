import type { ParticleEmitterData } from './ParticleEmitter';
import type { SceneNode, SceneNodeRuntime } from './SceneNode';

export interface ParticleEmitter3D extends SceneNode {
  data: ParticleEmitterData;
}

export type ParticleEmitter3DRuntime = SceneNodeRuntime;

export const ParticleEmitter3DKind = 'ParticleEmitter3D';

import type { ParticleEmitterData } from './ParticleEmitter2D';
import type { ParticleBlendMode } from './ParticleEmitterConfig';
import type { SceneNode, SceneNodeRuntime } from './SceneNode';

export interface ParticleEmitter3D extends SceneNode {
  // How each particle composites against what is already in the target. 'add' is the canonical
  // fire/glow mode (a black-background sprite that brightens rather than occludes). Defaults to
  // 'normal'; the config's blendMode is only a parse-time hint, so it must be set here to take effect.
  blendMode: ParticleBlendMode;
  data: ParticleEmitterData;
}

export type ParticleEmitter3DRuntime = SceneNodeRuntime;

export const ParticleEmitter3DKind = 'ParticleEmitter3D';

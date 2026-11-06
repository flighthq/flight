import type { ParticleBlendMode } from '@flighthq/particles/contract';
import type { Node3D, Node3DRuntime } from '@flighthq/scene3d/contract';

import type { ParticleEmitterData } from './ParticleEmitter2D.ts';

export interface ParticleEmitter3D extends Node3D {
  // How each particle composites against what is already in the target. 'add' is the canonical
  // fire/glow mode (a black-background sprite that brightens rather than occludes). Defaults to
  // 'normal'; the config's blendMode is only a parse-time hint, so it must be set here to take effect.
  blendMode: ParticleBlendMode;
  data: ParticleEmitterData;
}

export type ParticleEmitter3DRuntime = Node3DRuntime;

export const ParticleEmitter3DKind = 'ParticleEmitter3D';

import type { ParticleCurve } from './ParticleCurve';

export type ParticleEmitterShape = 'point' | 'circle' | 'rect';

/** Blend mode hint stored in the config for round-tripping through format parsers.
 *  Apply it to the emitter node (e.g. `emitter.blendMode = BlendMode.Add`) after
 *  parsing if you want it to take effect in the renderer. */
export type ParticleBlendMode = 'add' | 'multiply' | 'normal' | 'screen';

export interface ParticleEmitterConfig {
  readonly alphaEnd: number;
  readonly alphaStart: number;
  readonly blendMode: ParticleBlendMode | null;
  readonly colorEndB: number;
  readonly colorEndG: number;
  readonly colorEndR: number;
  readonly colorEndVarianceB: number;
  readonly colorEndVarianceG: number;
  readonly colorEndVarianceR: number;
  readonly colorStartB: number;
  readonly colorStartG: number;
  readonly colorStartR: number;
  readonly colorStartVarianceB: number;
  readonly colorStartVarianceG: number;
  readonly colorStartVarianceR: number;
  readonly directionX: number;
  readonly directionY: number;
  readonly gravityX: number;
  readonly gravityY: number;
  readonly emitterHeight: number;
  readonly emitterRadius: number;
  readonly emitterShape: ParticleEmitterShape;
  readonly emitterWidth: number;
  readonly burstCount: number;
  readonly burstInterval: number;
  readonly duration: number;
  readonly loop: boolean;
  readonly frameCount: number;
  readonly frameRate: number;
  readonly lifetimeMax: number;
  readonly lifetimeMin: number;
  readonly maxParticles: number;
  readonly regionIdMax: number;
  readonly regionIdMin: number;
  readonly scaleEnd: number;
  readonly scaleMax: number;
  readonly scaleMin: number;
  readonly speedMax: number;
  readonly speedMin: number;
  readonly spawnRate: number;
  readonly spread: number;
  readonly rotationSpeedMax: number;
  readonly rotationSpeedMin: number;
  readonly velocityInheritance: number;
  readonly alphaCurve: ParticleCurve | null;
  readonly colorCurve: ParticleCurve | null;
  readonly scaleCurve: ParticleCurve | null;
  readonly worldSpace: boolean;
}

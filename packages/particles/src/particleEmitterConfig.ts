import type { ParticleCurve } from './curve';

export type ParticleEmitterShape = 'point' | 'circle' | 'rect';

/** Blend mode hint stored in the config for round-tripping through format parsers.
 *  Apply it to the emitter node (e.g. `emitter.blendMode = BlendMode.Add`) after
 *  parsing if you want it to take effect in the renderer. */
export type ParticleBlendMode = 'add' | 'multiply' | 'normal' | 'screen';

export interface ParticleEmitterConfig {
  // Alpha
  readonly alphaEnd: number;
  readonly alphaStart: number;
  // Blend mode hint (does not affect simulation; apply to node for rendering)
  readonly blendMode: ParticleBlendMode | null;
  // Color tint interpolated over lifetime (RGB, 0–1 each)
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
  // Physics
  readonly directionX: number;
  readonly directionY: number;
  readonly gravityX: number;
  readonly gravityY: number;
  // Emission shape
  readonly emitterHeight: number;
  readonly emitterRadius: number;
  readonly emitterShape: ParticleEmitterShape;
  readonly emitterWidth: number;
  // Burst emission (burstCount=0 disables)
  readonly burstCount: number;
  readonly burstInterval: number;
  // Emitter lifetime: how long the emitter spawns particles, in seconds.
  // duration <= 0 means emit forever. When loop is true the emitter emits
  // indefinitely regardless of duration; when loop is false it stops emitting
  // after `duration` seconds (existing particles still age out). Use
  // isEmitterComplete / isParticleObjectsComplete to detect a finished one-shot.
  readonly duration: number;
  readonly loop: boolean;
  // Flipbook animation (frameCount=1 disables)
  readonly frameCount: number;
  readonly frameRate: number;
  // Lifetime
  readonly lifetimeMax: number;
  readonly lifetimeMin: number;
  readonly maxParticles: number;
  // Texture atlas region
  readonly regionIdMax: number;
  readonly regionIdMin: number;
  // Scale (scaleEnd is a multiplier applied to the spawn scale at end of life)
  readonly scaleEnd: number;
  readonly scaleMax: number;
  readonly scaleMin: number;
  // Speed
  readonly speedMax: number;
  readonly speedMin: number;
  readonly spawnRate: number;
  readonly spread: number;
  // Per-particle rotation speed (rad/s)
  readonly rotationSpeedMax: number;
  readonly rotationSpeedMin: number;
  // Velocity inheritance — fraction of emitter velocity added to newly spawned particles (0–1)
  readonly velocityInheritance: number;
  // Opt-in non-linear lifetime ramps (null = use the linear start→end path).
  // alphaCurve/scaleCurve are scalar LUTs; colorCurve is interleaved RGB (N×3).
  // A curve overrides the corresponding linear/variance interpolation.
  readonly alphaCurve: ParticleCurve | null;
  readonly colorCurve: ParticleCurve | null;
  readonly scaleCurve: ParticleCurve | null;
  // World-space emission: particles store world-space positions and don't move with the emitter
  readonly worldSpace: boolean;
}

export function createParticleEmitterConfig(config?: Partial<ParticleEmitterConfig>): ParticleEmitterConfig {
  return {
    alphaCurve: config?.alphaCurve ?? null,
    alphaEnd: config?.alphaEnd ?? 0,
    alphaStart: config?.alphaStart ?? 1,
    blendMode: config?.blendMode ?? null,
    colorCurve: config?.colorCurve ?? null,
    scaleCurve: config?.scaleCurve ?? null,
    burstCount: config?.burstCount ?? 0,
    burstInterval: config?.burstInterval ?? 0,
    duration: config?.duration ?? 0,
    loop: config?.loop ?? true,
    colorEndB: config?.colorEndB ?? 1,
    colorEndG: config?.colorEndG ?? 1,
    colorEndR: config?.colorEndR ?? 1,
    colorEndVarianceB: config?.colorEndVarianceB ?? 0,
    colorEndVarianceG: config?.colorEndVarianceG ?? 0,
    colorEndVarianceR: config?.colorEndVarianceR ?? 0,
    colorStartB: config?.colorStartB ?? 1,
    colorStartG: config?.colorStartG ?? 1,
    colorStartR: config?.colorStartR ?? 1,
    colorStartVarianceB: config?.colorStartVarianceB ?? 0,
    colorStartVarianceG: config?.colorStartVarianceG ?? 0,
    colorStartVarianceR: config?.colorStartVarianceR ?? 0,
    directionX: config?.directionX ?? 0,
    directionY: config?.directionY ?? -1,
    emitterHeight: config?.emitterHeight ?? 0,
    emitterRadius: config?.emitterRadius ?? 0,
    emitterShape: config?.emitterShape ?? 'point',
    emitterWidth: config?.emitterWidth ?? 0,
    frameCount: config?.frameCount ?? 1,
    frameRate: config?.frameRate ?? 12,
    gravityX: config?.gravityX ?? 0,
    gravityY: config?.gravityY ?? 0,
    lifetimeMax: config?.lifetimeMax ?? 1,
    lifetimeMin: config?.lifetimeMin ?? 0.5,
    maxParticles: config?.maxParticles ?? 1000,
    regionIdMax: config?.regionIdMax ?? 1,
    regionIdMin: config?.regionIdMin ?? 0,
    rotationSpeedMax: config?.rotationSpeedMax ?? 0,
    rotationSpeedMin: config?.rotationSpeedMin ?? 0,
    scaleEnd: config?.scaleEnd ?? 1,
    scaleMax: config?.scaleMax ?? 1,
    scaleMin: config?.scaleMin ?? 1,
    speedMax: config?.speedMax ?? 100,
    speedMin: config?.speedMin ?? 50,
    spawnRate: config?.spawnRate ?? 10,
    spread: config?.spread ?? Math.PI,
    velocityInheritance: config?.velocityInheritance ?? 0,
    worldSpace: config?.worldSpace ?? false,
  };
}

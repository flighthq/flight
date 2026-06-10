export type ParticleEmitterShape = 'point' | 'circle' | 'rect';

export interface ParticleEmitterConfig {
  // Alpha
  readonly alphaEnd: number;
  readonly alphaStart: number;
  // Color tint interpolated over lifetime (RGB, 0–1 each)
  readonly colorEndB: number;
  readonly colorEndG: number;
  readonly colorEndR: number;
  readonly colorStartB: number;
  readonly colorStartG: number;
  readonly colorStartR: number;
  // Physics
  readonly directionX: number;
  readonly directionY: number;
  readonly gravityX: number;
  readonly gravityY: number;
  // Emission shape
  readonly emitterHeight: number; // rect half-height
  readonly emitterRadius: number; // circle radius
  readonly emitterShape: ParticleEmitterShape;
  readonly emitterWidth: number; // rect half-width
  // Burst emission (burstCount=0 disables)
  readonly burstCount: number;
  readonly burstInterval: number; // seconds between bursts; 0 = one-shot
  // Flipbook animation (frameCount=1 disables)
  readonly frameCount: number;
  readonly frameRate: number; // frames per second
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
}

export function createParticleEmitterConfig(config?: Partial<ParticleEmitterConfig>): ParticleEmitterConfig {
  return {
    alphaEnd: config?.alphaEnd ?? 0,
    alphaStart: config?.alphaStart ?? 1,
    burstCount: config?.burstCount ?? 0,
    burstInterval: config?.burstInterval ?? 0,
    colorEndB: config?.colorEndB ?? 1,
    colorEndG: config?.colorEndG ?? 1,
    colorEndR: config?.colorEndR ?? 1,
    colorStartB: config?.colorStartB ?? 1,
    colorStartG: config?.colorStartG ?? 1,
    colorStartR: config?.colorStartR ?? 1,
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
  };
}

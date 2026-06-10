export interface ParticleEmitterConfig {
  readonly alphaEnd: number;
  readonly alphaStart: number;
  readonly directionX: number;
  readonly directionY: number;
  readonly gravityX: number;
  readonly gravityY: number;
  readonly lifetimeMax: number;
  readonly lifetimeMin: number;
  readonly maxParticles: number;
  readonly regionIdMax: number;
  readonly regionIdMin: number;
  readonly scaleMax: number;
  readonly scaleMin: number;
  readonly speedMax: number;
  readonly speedMin: number;
  readonly spawnRate: number;
  readonly spread: number;
}

export function createParticleEmitterConfig(config?: Partial<ParticleEmitterConfig>): ParticleEmitterConfig {
  return {
    alphaEnd: config?.alphaEnd ?? 0,
    alphaStart: config?.alphaStart ?? 1,
    directionX: config?.directionX ?? 0,
    directionY: config?.directionY ?? -1,
    gravityX: config?.gravityX ?? 0,
    gravityY: config?.gravityY ?? 0,
    lifetimeMax: config?.lifetimeMax ?? 1,
    lifetimeMin: config?.lifetimeMin ?? 0.5,
    maxParticles: config?.maxParticles ?? 1000,
    regionIdMax: config?.regionIdMax ?? 1,
    regionIdMin: config?.regionIdMin ?? 0,
    scaleMax: config?.scaleMax ?? 1,
    scaleMin: config?.scaleMin ?? 1,
    speedMax: config?.speedMax ?? 100,
    speedMin: config?.speedMin ?? 50,
    spawnRate: config?.spawnRate ?? 10,
    spread: config?.spread ?? Math.PI,
  };
}

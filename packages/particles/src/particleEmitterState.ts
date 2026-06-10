export interface ParticleEmitterState {
  lifetimes: Float32Array; // [age, maxAge] × capacity — simulation state
  spawnAccumulator: number;
  velocities: Float32Array; // [vx, vy] × capacity — simulation state
}

export function createParticleEmitterState(): ParticleEmitterState {
  return {
    lifetimes: new Float32Array(),
    spawnAccumulator: 0,
    velocities: new Float32Array(),
  };
}

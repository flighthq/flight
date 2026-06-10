export interface ParticleEmitterState {
  burstTimer: number; // counts down to next burst; starts at 0 to fire on first frame
  lifetimes: Float32Array; // [age, maxAge] × capacity
  rotationSpeeds: Float32Array; // rad/s × capacity — per-particle spin rate
  scales: Float32Array; // spawn scale × capacity — needed to animate scale over lifetime
  spawnAccumulator: number;
  velocities: Float32Array; // [vx, vy] × capacity
}

export function createParticleEmitterState(): ParticleEmitterState {
  return {
    burstTimer: 0,
    lifetimes: new Float32Array(),
    rotationSpeeds: new Float32Array(),
    scales: new Float32Array(),
    spawnAccumulator: 0,
    velocities: new Float32Array(),
  };
}

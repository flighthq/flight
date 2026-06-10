import { reserveFloat32Array } from '@flighthq/geometry';
import { invalidateLocalBounds } from '@flighthq/scene';
import { reserveParticleEmitter } from '@flighthq/scene-sprite';
import type { ParticleEmitter } from '@flighthq/types';

import type { ParticleEmitterConfig } from './particleEmitterConfig';
import type { ParticleEmitterState } from './particleEmitterState';

const PARTICLE_TRANSFORM_STRIDE = 4; // must match scene-sprite/particleEmitter.ts

export function updateParticleEmitter(
  emitter: ParticleEmitter,
  state: ParticleEmitterState,
  config: Readonly<ParticleEmitterConfig>,
  dt: number,
): void {
  const data = emitter.data;

  // Phase 1: age all live particles, compact dead ones to the tail by swap-with-last.
  const lifetimes = state.lifetimes;
  const velocities = state.velocities;
  const gx = config.gravityX * dt;
  const gy = config.gravityY * dt;
  let liveCount = data.particleCount;
  let i = 0;
  while (i < liveCount) {
    const lt = i * 2;
    lifetimes[lt] += dt;
    if (lifetimes[lt] >= lifetimes[lt + 1]) {
      // Kill: swap particle i with the last live particle, shrink the live region.
      liveCount--;
      if (i < liveCount) {
        const lt2 = liveCount * 2;
        lifetimes[lt] = lifetimes[lt2];
        lifetimes[lt + 1] = lifetimes[lt2 + 1];
        const vt = i * 2;
        const vt2 = liveCount * 2;
        velocities[vt] = velocities[vt2];
        velocities[vt + 1] = velocities[vt2 + 1];
        const tt = i * PARTICLE_TRANSFORM_STRIDE;
        const tt2 = liveCount * PARTICLE_TRANSFORM_STRIDE;
        data.transforms[tt] = data.transforms[tt2];
        data.transforms[tt + 1] = data.transforms[tt2 + 1];
        data.transforms[tt + 2] = data.transforms[tt2 + 2];
        data.transforms[tt + 3] = data.transforms[tt2 + 3];
        data.alphas[i] = data.alphas[liveCount];
        data.ids[i] = data.ids[liveCount];
      }
      // Re-process slot i (now holds a different particle) — do not increment.
      continue;
    }
    // Integrate: apply gravity to velocity, velocity to position.
    const vt = i * 2;
    velocities[vt] += gx;
    velocities[vt + 1] += gy;
    const tt = i * PARTICLE_TRANSFORM_STRIDE;
    data.transforms[tt] += velocities[vt] * dt;
    data.transforms[tt + 1] += velocities[vt + 1] * dt;
    // Interpolate alpha from alphaStart → alphaEnd over lifetime.
    const lifeFraction = lifetimes[lt] / lifetimes[lt + 1];
    data.alphas[i] = config.alphaStart + (config.alphaEnd - config.alphaStart) * lifeFraction;
    i++;
  }
  data.particleCount = liveCount;

  // Phase 2: spawn new particles.
  state.spawnAccumulator += config.spawnRate * dt;
  let toSpawn = Math.floor(state.spawnAccumulator);
  state.spawnAccumulator -= toSpawn;
  const maxNew = config.maxParticles - liveCount;
  if (toSpawn > maxNew) toSpawn = maxNew;

  if (toSpawn > 0) {
    const newCount = liveCount + toSpawn;
    reserveParticleEmitter(emitter, newCount);
    ensureStateCapacity(state, newCount);

    const baseAngle = Math.atan2(config.directionY, config.directionX);
    const regionRange = config.regionIdMax - config.regionIdMin;
    for (let s = 0; s < toSpawn; s++) {
      const idx = liveCount + s;
      const lifetime = config.lifetimeMin + Math.random() * (config.lifetimeMax - config.lifetimeMin);
      const lt = idx * 2;
      state.lifetimes[lt] = 0;
      state.lifetimes[lt + 1] = lifetime;
      const angle = baseAngle + (Math.random() - 0.5) * 2 * config.spread;
      const speed = config.speedMin + Math.random() * (config.speedMax - config.speedMin);
      const vt = idx * 2;
      state.velocities[vt] = Math.cos(angle) * speed;
      state.velocities[vt + 1] = Math.sin(angle) * speed;
      const tt = idx * PARTICLE_TRANSFORM_STRIDE;
      data.transforms[tt] = 0;
      data.transforms[tt + 1] = 0;
      data.transforms[tt + 2] = angle;
      data.transforms[tt + 3] = config.scaleMin + Math.random() * (config.scaleMax - config.scaleMin);
      data.alphas[idx] = config.alphaStart;
      data.ids[idx] = config.regionIdMin + (regionRange > 0 ? (Math.random() * regionRange) | 0 : 0);
    }
    data.particleCount = newCount;
  }

  invalidateLocalBounds(emitter);
}

function ensureStateCapacity(state: ParticleEmitterState, capacity: number): void {
  if (state.lifetimes.length >= capacity * 2) return;
  state.lifetimes = reserveFloat32Array(state.lifetimes, capacity * 2);
  state.velocities = reserveFloat32Array(state.velocities, capacity * 2);
}

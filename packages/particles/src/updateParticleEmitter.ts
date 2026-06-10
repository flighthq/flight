import { reserveFloat32Array } from '@flighthq/geometry';
import { invalidateLocalBounds } from '@flighthq/scene';
import { reserveParticleEmitter } from '@flighthq/scene-sprite';
import type { ParticleEmitter } from '@flighthq/types';

import type { ParticleEmitterConfig } from './particleEmitterConfig';
import type { ParticleEmitterState } from './particleEmitterState';

const PARTICLE_TRANSFORM_STRIDE = 4; // must match scene-sprite/particleEmitter.ts
const TWO_PI = Math.PI * 2;

export interface ParticleEmitterCallbacks {
  onDeath?: (x: number, y: number) => void;
  onSpawn?: (x: number, y: number) => void;
}

export function updateParticleEmitter(
  emitter: ParticleEmitter,
  state: ParticleEmitterState,
  config: Readonly<ParticleEmitterConfig>,
  dt: number,
  callbacks?: ParticleEmitterCallbacks,
): void {
  const data = emitter.data;

  // Phase 1: age all live particles, compact dead ones to the tail by swap-with-last.
  const lifetimes = state.lifetimes;
  const velocities = state.velocities;
  const scales = state.scales;
  const rotationSpeeds = state.rotationSpeeds;
  const gx = config.gravityX * dt;
  const gy = config.gravityY * dt;
  const { colorStartR, colorStartG, colorStartB, colorEndR, colorEndG, colorEndB } = config;
  const hasColorGradient = colorStartR !== colorEndR || colorStartG !== colorEndG || colorStartB !== colorEndB;
  const hasScaleAnim = config.scaleEnd !== 1;
  const hasRotationSpeed = config.rotationSpeedMin !== 0 || config.rotationSpeedMax !== 0;
  const hasFlipbook = config.frameCount > 1;
  const onDeath = callbacks?.onDeath;
  const onSpawn = callbacks?.onSpawn;

  let liveCount = data.particleCount;
  let i = 0;
  while (i < liveCount) {
    const lt = i * 2;
    lifetimes[lt] += dt;
    if (lifetimes[lt] >= lifetimes[lt + 1]) {
      // Kill: notify, then swap with last live particle.
      if (onDeath !== undefined) {
        const tt = i * PARTICLE_TRANSFORM_STRIDE;
        onDeath(data.transforms[tt], data.transforms[tt + 1]);
      }
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
        const ct = i * 3;
        const ct2 = liveCount * 3;
        data.colors[ct] = data.colors[ct2];
        data.colors[ct + 1] = data.colors[ct2 + 1];
        data.colors[ct + 2] = data.colors[ct2 + 2];
        scales[i] = scales[liveCount];
        rotationSpeeds[i] = rotationSpeeds[liveCount];
      }
      // Re-process slot i (now holds a different particle).
      continue;
    }

    // Integrate: gravity → velocity → position.
    const vt = i * 2;
    velocities[vt] += gx;
    velocities[vt + 1] += gy;
    const tt = i * PARTICLE_TRANSFORM_STRIDE;
    data.transforms[tt] += velocities[vt] * dt;
    data.transforms[tt + 1] += velocities[vt + 1] * dt;

    const lifeFraction = lifetimes[lt] / lifetimes[lt + 1];

    // Alpha.
    data.alphas[i] = config.alphaStart + (config.alphaEnd - config.alphaStart) * lifeFraction;

    // Color.
    if (hasColorGradient) {
      const ct = i * 3;
      data.colors[ct] = colorStartR + (colorEndR - colorStartR) * lifeFraction;
      data.colors[ct + 1] = colorStartG + (colorEndG - colorStartG) * lifeFraction;
      data.colors[ct + 2] = colorStartB + (colorEndB - colorStartB) * lifeFraction;
    }

    // Scale over lifetime.
    if (hasScaleAnim) {
      data.transforms[tt + 3] = scales[i] * (1 + (config.scaleEnd - 1) * lifeFraction);
    }

    // Rotation speed.
    if (hasRotationSpeed) {
      data.transforms[tt + 2] += rotationSpeeds[i] * dt;
    }

    // Flipbook: step through atlas regions based on age.
    if (hasFlipbook) {
      const frame = Math.floor(lifetimes[lt] * config.frameRate) % config.frameCount;
      data.ids[i] = config.regionIdMin + frame;
    }

    i++;
  }
  data.particleCount = liveCount;

  // Phase 2: spawn new particles (continuous rate).
  state.spawnAccumulator += config.spawnRate * dt;
  let toSpawn = Math.floor(state.spawnAccumulator);
  state.spawnAccumulator -= toSpawn;

  // Burst emission.
  if (config.burstCount > 0) {
    state.burstTimer -= dt;
    if (state.burstTimer <= 0) {
      toSpawn += config.burstCount;
      state.burstTimer = config.burstInterval > 0 ? config.burstInterval : Infinity;
    }
  }

  const maxNew = config.maxParticles - liveCount;
  if (toSpawn > maxNew) toSpawn = maxNew;

  if (toSpawn > 0) {
    const newCount = liveCount + toSpawn;
    reserveParticleEmitter(emitter, newCount);
    ensureStateCapacity(state, newCount);

    const baseAngle = Math.atan2(config.directionY, config.directionX);
    const regionRange = config.regionIdMax - config.regionIdMin;
    const regionIdMin = config.regionIdMin;
    const hasRotSpeed = config.rotationSpeedMin !== 0 || config.rotationSpeedMax !== 0;
    const rotSpeedRange = config.rotationSpeedMax - config.rotationSpeedMin;

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

      // Spawn position based on emitter shape.
      let spawnX = 0;
      let spawnY = 0;
      if (config.emitterShape === 'circle' && config.emitterRadius > 0) {
        const r = Math.sqrt(Math.random()) * config.emitterRadius;
        const a = Math.random() * TWO_PI;
        spawnX = Math.cos(a) * r;
        spawnY = Math.sin(a) * r;
      } else if (config.emitterShape === 'rect' && (config.emitterWidth > 0 || config.emitterHeight > 0)) {
        spawnX = (Math.random() - 0.5) * config.emitterWidth;
        spawnY = (Math.random() - 0.5) * config.emitterHeight;
      }

      const spawnScale = config.scaleMin + Math.random() * (config.scaleMax - config.scaleMin);
      // Write to state arrays directly after ensureStateCapacity may have reallocated them.
      state.scales[idx] = spawnScale;

      const tt = idx * PARTICLE_TRANSFORM_STRIDE;
      data.transforms[tt] = spawnX;
      data.transforms[tt + 1] = spawnY;
      data.transforms[tt + 2] = angle;
      data.transforms[tt + 3] = spawnScale;
      data.alphas[idx] = config.alphaStart;

      // Color at birth.
      const ct = idx * 3;
      data.colors[ct] = colorStartR;
      data.colors[ct + 1] = colorStartG;
      data.colors[ct + 2] = colorStartB;

      // Flipbook: start at first frame.
      data.ids[idx] =
        regionIdMin + (config.frameCount > 1 ? 0 : regionRange > 0 ? (Math.random() * regionRange) | 0 : 0);

      // Per-particle rotation speed.
      state.rotationSpeeds[idx] = hasRotSpeed ? config.rotationSpeedMin + Math.random() * rotSpeedRange : 0;

      onSpawn?.(spawnX, spawnY);
    }
    data.particleCount = newCount;
  }

  invalidateLocalBounds(emitter);
}

function ensureStateCapacity(state: ParticleEmitterState, capacity: number): void {
  if (state.lifetimes.length >= capacity * 2) return;
  state.lifetimes = reserveFloat32Array(state.lifetimes, capacity * 2);
  state.velocities = reserveFloat32Array(state.velocities, capacity * 2);
  state.scales = reserveFloat32Array(state.scales, capacity);
  state.rotationSpeeds = reserveFloat32Array(state.rotationSpeeds, capacity);
}

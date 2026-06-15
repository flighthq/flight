import { reserveParticleEmitter } from '@flighthq/sprite';
import type { ParticleEmitter } from '@flighthq/types';
import type { ParticleEmitterConfig, ParticleEmitterState } from '@flighthq/types';

import { sampleParticleColorCurve, sampleParticleCurve } from './curve';
import { ensureParticleEmitterStateCapacity } from './particleEmitterState';

const PARTICLE_TRANSFORM_STRIDE = 4;
const TWO_PI = Math.PI * 2;

/** Emit `count` particles immediately at an arbitrary point (in the emitter's
 *  simulation space), independent of the emitter's own spawn rate, bursts, or
 *  duration. Returns the number actually spawned (capped by `maxParticles`).
 *
 *  This is the building block for sub-emitters: call it from an `onDeath` /
 *  `onSpawn` callback to spawn a child effect at the event position (explosions,
 *  debris, impact sparks), or once per live particle for trails. The child
 *  emitter/state/config are completely independent of the parent.
 *
 *  Spawn randomness is drawn from `state.random`, so a seeded child state keeps
 *  sub-emitter output deterministic. */
export function emitParticleBurst(
  emitter: ParticleEmitter,
  state: ParticleEmitterState,
  config: Readonly<ParticleEmitterConfig>,
  count: number,
  x: number,
  y: number,
): number {
  const data = emitter.data;
  const liveCount = data.particleCount;
  let toSpawn = Math.floor(count);
  const maxNew = config.maxParticles - liveCount;
  if (toSpawn > maxNew) toSpawn = maxNew;
  if (toSpawn <= 0) return 0;

  const hasColorVariance =
    config.colorStartVarianceR !== 0 ||
    config.colorStartVarianceG !== 0 ||
    config.colorStartVarianceB !== 0 ||
    config.colorEndVarianceR !== 0 ||
    config.colorEndVarianceG !== 0 ||
    config.colorEndVarianceB !== 0;

  const newCount = liveCount + toSpawn;
  reserveParticleEmitter(emitter, newCount);
  ensureParticleEmitterStateCapacity(state, newCount, hasColorVariance);

  const { colorStartR, colorStartG, colorStartB, colorEndR, colorEndG, colorEndB } = config;
  const alphaCurve = config.alphaCurve;
  const colorCurve = config.colorCurve;
  const scaleCurve = config.scaleCurve;
  const hasAlphaCurve = alphaCurve != null && alphaCurve.length > 0;
  const hasColorCurve = colorCurve != null && colorCurve.length >= 3;
  const hasScaleCurve = scaleCurve != null && scaleCurve.length > 0;
  const baseAngle = Math.atan2(config.directionY, config.directionX);
  const regionRange = config.regionIdMax - config.regionIdMin;
  const regionIdMin = config.regionIdMin;
  const rotSpeedRange = config.rotationSpeedMax - config.rotationSpeedMin;
  const hasRotSpeed = config.rotationSpeedMin !== 0 || config.rotationSpeedMax !== 0;
  const random = state.random;

  for (let sIdx = 0; sIdx < toSpawn; sIdx++) {
    const idx = liveCount + sIdx;

    const lifetime = config.lifetimeMin + random() * (config.lifetimeMax - config.lifetimeMin);
    const lt = idx * 2;
    state.lifetimes[lt] = 0;
    state.lifetimes[lt + 1] = lifetime;

    const angle = baseAngle + (random() - 0.5) * 2 * config.spread;
    const speed = config.speedMin + random() * (config.speedMax - config.speedMin);
    state.velocities[idx * 2] = Math.cos(angle) * speed;
    state.velocities[idx * 2 + 1] = Math.sin(angle) * speed;

    // Position = burst point + emitter-shape offset.
    let spawnX = x;
    let spawnY = y;
    if (config.emitterShape === 'circle' && config.emitterRadius > 0) {
      const r = Math.sqrt(random()) * config.emitterRadius;
      const a = random() * TWO_PI;
      spawnX += Math.cos(a) * r;
      spawnY += Math.sin(a) * r;
    } else if (config.emitterShape === 'rect' && (config.emitterWidth > 0 || config.emitterHeight > 0)) {
      spawnX += (random() - 0.5) * config.emitterWidth;
      spawnY += (random() - 0.5) * config.emitterHeight;
    }

    const spawnScale = config.scaleMin + random() * (config.scaleMax - config.scaleMin);
    state.scales[idx] = spawnScale;

    const tt = idx * PARTICLE_TRANSFORM_STRIDE;
    data.transforms[tt] = spawnX;
    data.transforms[tt + 1] = spawnY;
    data.transforms[tt + 2] = angle;
    data.transforms[tt + 3] = hasScaleCurve ? spawnScale * sampleParticleCurve(scaleCurve, 0) : spawnScale;
    data.alphas[idx] = hasAlphaCurve ? sampleParticleCurve(alphaCurve, 0) : config.alphaStart;

    const ct = idx * 3;
    if (hasColorCurve) {
      sampleParticleColorCurve(colorCurve, 0, data.colors, ct);
    } else if (hasColorVariance) {
      const r0 = clamp01(colorStartR + (random() - 0.5) * 2 * config.colorStartVarianceR);
      const g0 = clamp01(colorStartG + (random() - 0.5) * 2 * config.colorStartVarianceG);
      const b0 = clamp01(colorStartB + (random() - 0.5) * 2 * config.colorStartVarianceB);
      const r1 = clamp01(colorEndR + (random() - 0.5) * 2 * config.colorEndVarianceR);
      const g1 = clamp01(colorEndG + (random() - 0.5) * 2 * config.colorEndVarianceG);
      const b1 = clamp01(colorEndB + (random() - 0.5) * 2 * config.colorEndVarianceB);
      state.colorBirth[ct] = r0;
      state.colorBirth[ct + 1] = g0;
      state.colorBirth[ct + 2] = b0;
      state.colorDeath[ct] = r1;
      state.colorDeath[ct + 1] = g1;
      state.colorDeath[ct + 2] = b1;
      data.colors[ct] = r0;
      data.colors[ct + 1] = g0;
      data.colors[ct + 2] = b0;
    } else {
      data.colors[ct] = colorStartR;
      data.colors[ct + 1] = colorStartG;
      data.colors[ct + 2] = colorStartB;
    }

    data.ids[idx] = regionIdMin + (config.frameCount > 1 ? 0 : regionRange > 0 ? (random() * regionRange) | 0 : 0);
    state.rotationSpeeds[idx] = hasRotSpeed ? config.rotationSpeedMin + random() * rotSpeedRange : 0;
  }

  data.particleCount = newCount;
  return toSpawn;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

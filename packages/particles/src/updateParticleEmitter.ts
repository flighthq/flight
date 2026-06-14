import { invalidateNodeLocalBounds } from '@flighthq/node';
import { reserveParticleEmitter } from '@flighthq/sprite';
import type {
  ParticleEmitter,
  ParticleEmitterCallbacks,
  ParticleEmitterConfig,
  ParticleEmitterState,
  WorldTransform2D,
} from '@flighthq/types';

import { sampleColorCurve, sampleCurve } from './curve';
import { ensureParticleEmitterStateCapacity } from './particleEmitterState';

export type { ParticleEmitterCallbacks, WorldTransform2D };

const PARTICLE_TRANSFORM_STRIDE = 4; // must match scene-sprite/particleEmitter.ts
const TWO_PI = Math.PI * 2;

/** True once a finite, non-looping emitter has finished emitting AND all of its
 *  particles have died — i.e. a one-shot effect that is safe to recycle/remove.
 *  Always false for infinite or looping emitters (they never finish). */
export function isParticleEmitterComplete(
  emitter: ParticleEmitter,
  state: Readonly<ParticleEmitterState>,
  config: Readonly<ParticleEmitterConfig>,
): boolean {
  if (config.duration <= 0 || config.loop) return false;
  return state.emitterAge >= config.duration && emitter.data.particleCount === 0;
}

/** Whether an emitter with the given config is still spawning, given how long it
 *  has been emitting. Infinite (duration <= 0) and looping emitters always emit. */
function isEmitting(config: Readonly<ParticleEmitterConfig>, emitterAge: number): boolean {
  return config.duration <= 0 || config.loop || emitterAge < config.duration;
}

export function updateParticleEmitter(
  emitter: ParticleEmitter,
  state: ParticleEmitterState,
  config: Readonly<ParticleEmitterConfig>,
  dt: number,
  callbacks?: ParticleEmitterCallbacks,
  worldTransform?: Readonly<WorldTransform2D>,
): void {
  const data = emitter.data;

  // Sync world-space flag to data so renderers can read it.
  data.worldSpace = config.worldSpace;

  // Guard against a zero or negative time step: no time has elapsed, so there is
  // nothing to age, move, or spawn. Critically, this avoids dividing by dt when
  // computing emitter velocity below — a zero-dt frame that still fires a burst
  // would otherwise bake Infinity/NaN velocities into freshly spawned particles
  // and corrupt them for the rest of their lifetime.
  if (dt <= 0) return;

  // ── Emitter velocity (for velocity inheritance and trail interpolation) ───────
  // In world-space mode we track the world origin; in local-space mode we track
  // the emitter node position in parent space.
  const trackX = config.worldSpace && worldTransform != null ? worldTransform.tx : emitter.x;
  const trackY = config.worldSpace && worldTransform != null ? worldTransform.ty : emitter.y;
  const hasVelInherit = config.velocityInheritance !== 0;
  let emitterVelX = 0;
  let emitterVelY = 0;
  if (!isNaN(state.prevX)) {
    emitterVelX = (trackX - state.prevX) / dt;
    emitterVelY = (trackY - state.prevY) / dt;
  }

  // ── Phase 1: age all live particles, compact dead ones ──────────────────────
  const lifetimes = state.lifetimes;
  const velocities = state.velocities;
  const scales = state.scales;
  const rotationSpeeds = state.rotationSpeeds;
  const gx = config.gravityX * dt;
  const gy = config.gravityY * dt;
  const { colorStartR, colorStartG, colorStartB, colorEndR, colorEndG, colorEndB } = config;
  const hasColorVariance =
    config.colorStartVarianceR !== 0 ||
    config.colorStartVarianceG !== 0 ||
    config.colorStartVarianceB !== 0 ||
    config.colorEndVarianceR !== 0 ||
    config.colorEndVarianceG !== 0 ||
    config.colorEndVarianceB !== 0;
  const hasColorGradient =
    hasColorVariance || colorStartR !== colorEndR || colorStartG !== colorEndG || colorStartB !== colorEndB;
  // Opt-in lifetime curves override the linear paths below; an emitter without
  // curves never touches these branches beyond a predicted-not-taken check.
  const alphaCurve = config.alphaCurve;
  const colorCurve = config.colorCurve;
  const scaleCurve = config.scaleCurve;
  const hasAlphaCurve = alphaCurve != null && alphaCurve.length > 0;
  const hasColorCurve = colorCurve != null && colorCurve.length >= 3;
  const hasScaleCurve = scaleCurve != null && scaleCurve.length > 0;
  const hasScaleAnim = config.scaleEnd !== 1 || hasScaleCurve;
  const hasColorWork = hasColorCurve || hasColorGradient;
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
        if (hasColorVariance) {
          state.colorBirth[ct] = state.colorBirth[ct2];
          state.colorBirth[ct + 1] = state.colorBirth[ct2 + 1];
          state.colorBirth[ct + 2] = state.colorBirth[ct2 + 2];
          state.colorDeath[ct] = state.colorDeath[ct2];
          state.colorDeath[ct + 1] = state.colorDeath[ct2 + 1];
          state.colorDeath[ct + 2] = state.colorDeath[ct2 + 2];
        }
      }
      continue;
    }

    const vt = i * 2;
    velocities[vt] += gx;
    velocities[vt + 1] += gy;
    const tt = i * PARTICLE_TRANSFORM_STRIDE;
    data.transforms[tt] += velocities[vt] * dt;
    data.transforms[tt + 1] += velocities[vt + 1] * dt;

    const lifeFraction = lifetimes[lt] / lifetimes[lt + 1];

    data.alphas[i] = hasAlphaCurve
      ? sampleCurve(alphaCurve, lifeFraction)
      : config.alphaStart + (config.alphaEnd - config.alphaStart) * lifeFraction;

    if (hasColorWork) {
      const ct = i * 3;
      if (hasColorCurve) {
        sampleColorCurve(colorCurve, lifeFraction, data.colors, ct);
      } else if (hasColorVariance) {
        data.colors[ct] = state.colorBirth[ct] + (state.colorDeath[ct] - state.colorBirth[ct]) * lifeFraction;
        data.colors[ct + 1] =
          state.colorBirth[ct + 1] + (state.colorDeath[ct + 1] - state.colorBirth[ct + 1]) * lifeFraction;
        data.colors[ct + 2] =
          state.colorBirth[ct + 2] + (state.colorDeath[ct + 2] - state.colorBirth[ct + 2]) * lifeFraction;
      } else {
        data.colors[ct] = colorStartR + (colorEndR - colorStartR) * lifeFraction;
        data.colors[ct + 1] = colorStartG + (colorEndG - colorStartG) * lifeFraction;
        data.colors[ct + 2] = colorStartB + (colorEndB - colorStartB) * lifeFraction;
      }
    }

    if (hasScaleAnim) {
      const scaleFactor = hasScaleCurve
        ? sampleCurve(scaleCurve, lifeFraction)
        : 1 + (config.scaleEnd - 1) * lifeFraction;
      data.transforms[tt + 3] = scales[i] * scaleFactor;
    }

    if (hasRotationSpeed) {
      data.transforms[tt + 2] += rotationSpeeds[i] * dt;
    }

    if (hasFlipbook) {
      const frame = Math.floor(lifetimes[lt] * config.frameRate) % config.frameCount;
      data.ids[i] = config.regionIdMin + frame;
    }

    i++;
  }
  data.particleCount = liveCount;

  // ── Phase 2: spawn new particles ─────────────────────────────────────────────
  // A finite, non-looping emitter stops spawning once its duration elapses;
  // existing particles keep ageing out (use isParticleEmitterComplete to detect the end).
  const emitting = isEmitting(config, state.emitterAge);
  if (config.duration > 0 && !config.loop) state.emitterAge += dt;

  state.spawnAccumulator += emitting ? config.spawnRate * dt : 0;
  let toSpawn = Math.floor(state.spawnAccumulator);
  state.spawnAccumulator -= toSpawn;

  if (emitting && config.burstCount > 0) {
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
    ensureParticleEmitterStateCapacity(state, newCount, hasColorVariance);

    const baseAngle = Math.atan2(config.directionY, config.directionX);
    const regionRange = config.regionIdMax - config.regionIdMin;
    const regionIdMin = config.regionIdMin;
    const rotSpeedRange = config.rotationSpeedMax - config.rotationSpeedMin;
    const hasRotSpeed = config.rotationSpeedMin !== 0 || config.rotationSpeedMax !== 0;

    // World-space trail: distribute spawn origins along the path from prevPos → currentPos.
    const doTrail = config.worldSpace && worldTransform != null && !isNaN(state.prevX);
    const prevPathX = doTrail ? state.prevX : trackX;
    const prevPathY = doTrail ? state.prevY : trackY;

    for (let s = 0; s < toSpawn; s++) {
      const idx = liveCount + s;

      // Lifetime
      const lifetime = config.lifetimeMin + state.random() * (config.lifetimeMax - config.lifetimeMin);
      const lt = idx * 2;
      state.lifetimes[lt] = 0;
      state.lifetimes[lt + 1] = lifetime;

      // Velocity direction in local/emitter space
      const angle = baseAngle + (state.random() - 0.5) * 2 * config.spread;
      const speed = config.speedMin + state.random() * (config.speedMax - config.speedMin);
      let vx = Math.cos(angle) * speed;
      let vy = Math.sin(angle) * speed;

      // Spawn position (local to emitter, or shape offset)
      let spawnX = 0;
      let spawnY = 0;
      if (config.emitterShape === 'circle' && config.emitterRadius > 0) {
        const r = Math.sqrt(state.random()) * config.emitterRadius;
        const a = state.random() * TWO_PI;
        spawnX = Math.cos(a) * r;
        spawnY = Math.sin(a) * r;
      } else if (config.emitterShape === 'rect' && (config.emitterWidth > 0 || config.emitterHeight > 0)) {
        spawnX = (state.random() - 0.5) * config.emitterWidth;
        spawnY = (state.random() - 0.5) * config.emitterHeight;
      }

      // World-space: transform spawn position and velocity into world space,
      // and distribute origins along the emitter's movement path (trail interpolation).
      if (config.worldSpace && worldTransform != null) {
        const wt = worldTransform;
        // Trail: interpolate origin between prev and current world position
        const t = toSpawn > 1 ? s / (toSpawn - 1) : 1;
        const originX = prevPathX + (trackX - prevPathX) * t;
        const originY = prevPathY + (trackY - prevPathY) * t;
        // Apply rotation+scale of world transform to shape offset, then add trail origin
        const wx = wt.a * spawnX + wt.c * spawnY + originX;
        const wy = wt.b * spawnX + wt.d * spawnY + originY;
        spawnX = wx;
        spawnY = wy;
        // Rotate velocity by world transform (no translation for vectors)
        const wvx = wt.a * vx + wt.c * vy;
        const wvy = wt.b * vx + wt.d * vy;
        vx = wvx;
        vy = wvy;
      }

      // Velocity inheritance: blend emitter velocity into new particle velocity
      if (hasVelInherit && !isNaN(state.prevX)) {
        vx += emitterVelX * config.velocityInheritance;
        vy += emitterVelY * config.velocityInheritance;
      }

      const vt = idx * 2;
      state.velocities[vt] = vx;
      state.velocities[vt + 1] = vy;

      const spawnScale = config.scaleMin + state.random() * (config.scaleMax - config.scaleMin);
      state.scales[idx] = spawnScale;

      const tt = idx * PARTICLE_TRANSFORM_STRIDE;
      data.transforms[tt] = spawnX;
      data.transforms[tt + 1] = spawnY;
      data.transforms[tt + 2] = angle;
      data.transforms[tt + 3] = hasScaleCurve ? spawnScale * sampleCurve(scaleCurve, 0) : spawnScale;
      data.alphas[idx] = hasAlphaCurve ? sampleCurve(alphaCurve, 0) : config.alphaStart;

      // Color — curve takes precedence, then per-particle variance, then constants
      const ct = idx * 3;
      if (hasColorCurve) {
        sampleColorCurve(colorCurve, 0, data.colors, ct);
      } else if (hasColorVariance) {
        const r0 = clamp01(colorStartR + (state.random() - 0.5) * 2 * config.colorStartVarianceR);
        const g0 = clamp01(colorStartG + (state.random() - 0.5) * 2 * config.colorStartVarianceG);
        const b0 = clamp01(colorStartB + (state.random() - 0.5) * 2 * config.colorStartVarianceB);
        const r1 = clamp01(colorEndR + (state.random() - 0.5) * 2 * config.colorEndVarianceR);
        const g1 = clamp01(colorEndG + (state.random() - 0.5) * 2 * config.colorEndVarianceG);
        const b1 = clamp01(colorEndB + (state.random() - 0.5) * 2 * config.colorEndVarianceB);
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

      data.ids[idx] =
        regionIdMin + (config.frameCount > 1 ? 0 : regionRange > 0 ? (state.random() * regionRange) | 0 : 0);
      state.rotationSpeeds[idx] = hasRotSpeed ? config.rotationSpeedMin + state.random() * rotSpeedRange : 0;

      onSpawn?.(spawnX, spawnY);
    }
    data.particleCount = newCount;
  }

  // Update prev-position tracking for next frame.
  state.prevX = trackX;
  state.prevY = trackY;

  invalidateNodeLocalBounds(emitter);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

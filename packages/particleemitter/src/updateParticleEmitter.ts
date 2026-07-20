import { getNodeWorldMatrix, invalidateNodeLocalBounds } from '@flighthq/node';
import {
  PARTICLE_VELOCITY_STRIDE,
  ensureParticleEmitterStateCapacity,
  getParticleEmitterSignals,
  sampleParticleColorCurve,
  sampleParticleCurve,
} from '@flighthq/particles';
import type {
  DisplayObject,
  ParticleEmitter,
  ParticleEmitterCallbacks,
  ParticleEmitterConfig,
  ParticleEmitterState,
} from '@flighthq/types';

import { reserveParticleEmitter } from './particleEmitter';

export type { ParticleEmitterCallbacks };

const PARTICLE_TRANSFORM_STRIDE = 4; // must match ./particleEmitter
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
  deltaTime: number,
  callbacks?: ParticleEmitterCallbacks,
): void {
  const data = emitter.data;

  // World-space emitters bake spawns into world coordinates through the emitter's own 2D world transform
  // (the same one the renderer draws with), so particles stay put as the emitter moves; position a
  // world-space emitter by its node transform, not a passed-in transform. Only claim world-space to the
  // renderer when a transform is in hand, so it never skips the node transform over unbaked particles.
  const worldTransform = config.worldSpace ? getNodeWorldMatrix(emitter as unknown as DisplayObject) : null;
  data.worldSpace = worldTransform !== null;

  // Guard against a zero or negative time step: no time has elapsed, so there is
  // nothing to age, move, or spawn. Critically, this avoids dividing by deltaTime when
  // computing emitter velocity below — a zero-deltaTime frame that still fires a burst
  // would otherwise bake Infinity/NaN velocities into freshly spawned particles
  // and corrupt them for the rest of their lifetime.
  if (deltaTime <= 0) return;

  // ── Emitter velocity (for velocity inheritance and trail interpolation) ───────
  // In world-space mode we track the world origin; in local-space mode we track
  // the emitter node position in parent space.
  const trackX = worldTransform !== null ? worldTransform.tx : emitter.x;
  const trackY = worldTransform !== null ? worldTransform.ty : emitter.y;
  const hasVelInherit = config.velocityInheritance !== 0;
  let emitterVelX = 0;
  let emitterVelY = 0;
  if (!isNaN(state.prevX)) {
    emitterVelX = (trackX - state.prevX) / deltaTime;
    emitterVelY = (trackY - state.prevY) / deltaTime;
  }

  // ── Phase 1: age all live particles, compact dead ones ──────────────────────
  const lifetimes = state.lifetimes;
  const velocities = state.velocities;
  const scales = state.scales;
  const rotationSpeeds = state.rotationSpeeds;
  const positionsZ = data.positionsZ;
  const gx = config.gravityX * deltaTime;
  const gy = config.gravityY * deltaTime;
  const gz = config.gravityZ * deltaTime;
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
  // Opt-in signals: null when enableParticleEmitterSignals has not been called on this state.
  const signals = getParticleEmitterSignals(state);

  let liveCount = data.particleCount;
  let i = 0;
  while (i < liveCount) {
    const lt = i * 2;
    lifetimes[lt] += deltaTime;
    if (lifetimes[lt] >= lifetimes[lt + 1]) {
      if (onDeath !== undefined || signals !== null) {
        const tt = i * PARTICLE_TRANSFORM_STRIDE;
        const dx = data.transforms[tt];
        const dy = data.transforms[tt + 1];
        onDeath?.(dx, dy, 0);
        signals?.onParticleDeath.emit(dx, dy, 0);
      }
      liveCount--;
      if (i < liveCount) {
        const lt2 = liveCount * 2;
        lifetimes[lt] = lifetimes[lt2];
        lifetimes[lt + 1] = lifetimes[lt2 + 1];
        const vt = i * PARTICLE_VELOCITY_STRIDE;
        const vt2 = liveCount * PARTICLE_VELOCITY_STRIDE;
        velocities[vt] = velocities[vt2];
        velocities[vt + 1] = velocities[vt2 + 1];
        velocities[vt + 2] = velocities[vt2 + 2];
        const tt = i * PARTICLE_TRANSFORM_STRIDE;
        const tt2 = liveCount * PARTICLE_TRANSFORM_STRIDE;
        data.transforms[tt] = data.transforms[tt2];
        data.transforms[tt + 1] = data.transforms[tt2 + 1];
        data.transforms[tt + 2] = data.transforms[tt2 + 2];
        data.transforms[tt + 3] = data.transforms[tt2 + 3];
        positionsZ[i] = positionsZ[liveCount];
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

    const vt = i * PARTICLE_VELOCITY_STRIDE;
    velocities[vt] += gx;
    velocities[vt + 1] += gy;
    velocities[vt + 2] += gz;
    const tt = i * PARTICLE_TRANSFORM_STRIDE;
    data.transforms[tt] += velocities[vt] * deltaTime;
    data.transforms[tt + 1] += velocities[vt + 1] * deltaTime;
    positionsZ[i] += velocities[vt + 2] * deltaTime;

    const lifeFraction = lifetimes[lt] / lifetimes[lt + 1];

    data.alphas[i] = hasAlphaCurve
      ? sampleParticleCurve(alphaCurve, lifeFraction)
      : config.alphaStart + (config.alphaEnd - config.alphaStart) * lifeFraction;

    if (hasColorWork) {
      const ct = i * 3;
      if (hasColorCurve) {
        sampleParticleColorCurve(data.colors, ct, colorCurve, lifeFraction);
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
        ? sampleParticleCurve(scaleCurve, lifeFraction)
        : 1 + (config.scaleEnd - 1) * lifeFraction;
      data.transforms[tt + 3] = scales[i] * scaleFactor;
    }

    if (hasRotationSpeed) {
      data.transforms[tt + 2] += rotationSpeeds[i] * deltaTime;
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
  if (config.duration > 0 && !config.loop) state.emitterAge += deltaTime;

  state.spawnAccumulator += emitting ? config.spawnRate * deltaTime : 0;
  let toSpawn = Math.floor(state.spawnAccumulator);
  state.spawnAccumulator -= toSpawn;

  if (emitting && config.burstCount > 0) {
    state.burstTimer -= deltaTime;
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
    const doTrail = worldTransform !== null && !isNaN(state.prevX);
    const prevPathX = doTrail ? state.prevX : trackX;
    const prevPathY = doTrail ? state.prevY : trackY;

    // 3D direction unit vector for sphere/cone3d/box spawn shapes.
    const dirLen = Math.sqrt(
      config.directionX * config.directionX +
        config.directionY * config.directionY +
        config.directionZ * config.directionZ,
    );
    const dirNx = dirLen > 1e-6 ? config.directionX / dirLen : 0;
    const dirNy = dirLen > 1e-6 ? config.directionY / dirLen : -1;
    const dirNz = dirLen > 1e-6 ? config.directionZ / dirLen : 0;

    for (let sIdx = 0; sIdx < toSpawn; sIdx++) {
      const idx = liveCount + sIdx;

      // Lifetime
      const lifetime = config.lifetimeMin + state.random() * (config.lifetimeMax - config.lifetimeMin);
      const lt = idx * 2;
      state.lifetimes[lt] = 0;
      state.lifetimes[lt + 1] = lifetime;

      // Velocity direction in local/emitter space
      const speed = config.speedMin + state.random() * (config.speedMax - config.speedMin);
      let vx: number;
      let vy: number;
      let vz: number;

      // Spawn position (local to emitter, or shape offset)
      let spawnX = 0;
      let spawnY = 0;
      let spawnZ = 0;

      const shape = config.emitterShape;
      if (shape === 'sphere' || shape === 'cone3d') {
        // 3D velocity: uniform random direction on the sphere, or inside a cone.
        let sx: number;
        let sy: number;
        let sz: number;
        if (shape === 'cone3d' && config.emitterConeAngle > 0) {
          // Cone: generate a random direction within coneAngle (radians) of the direction vector.
          const coneHalf = config.emitterConeAngle / 2;
          const cosTheta = 1 - state.random() * (1 - Math.cos(coneHalf));
          const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
          const phi = state.random() * TWO_PI;
          // Local cone direction: z-aligned, then rotate to match direction vector.
          const lx = sinTheta * Math.cos(phi);
          const ly = sinTheta * Math.sin(phi);
          const lz = cosTheta;
          // Rotate from z-axis to direction vector using Rodrigues' rotation.
          const rDir = rotateToDirection(lx, ly, lz, dirNx, dirNy, dirNz);
          sx = rDir[0];
          sy = rDir[1];
          sz = rDir[2];
        } else {
          // Uniform sphere: Marsaglia method.
          let u: number;
          let v: number;
          let s2: number;
          do {
            u = state.random() * 2 - 1;
            v = state.random() * 2 - 1;
            s2 = u * u + v * v;
          } while (s2 >= 1 || s2 === 0);
          const f = 2 * Math.sqrt(1 - s2);
          sx = u * f;
          sy = v * f;
          sz = 1 - 2 * s2;
        }
        vx = sx * speed;
        vy = sy * speed;
        vz = sz * speed;

        // Spawn position for sphere shape
        if (config.emitterRadius > 0) {
          const r = Math.cbrt(state.random()) * config.emitterRadius;
          // Uniform random direction for position offset
          let pu: number;
          let pv: number;
          let ps2: number;
          do {
            pu = state.random() * 2 - 1;
            pv = state.random() * 2 - 1;
            ps2 = pu * pu + pv * pv;
          } while (ps2 >= 1 || ps2 === 0);
          const pf = 2 * Math.sqrt(1 - ps2);
          spawnX = pu * pf * r;
          spawnY = pv * pf * r;
          spawnZ = (1 - 2 * ps2) * r;
        }
      } else if (shape === 'box') {
        // Box shape: random position in a 3D box, 2D velocity spread
        const angle = baseAngle + (state.random() - 0.5) * 2 * config.spread;
        vx = Math.cos(angle) * speed;
        vy = Math.sin(angle) * speed;
        vz = (config.directionZ * speed) / (dirLen > 1e-6 ? dirLen : 1);
        spawnX = (state.random() - 0.5) * config.emitterWidth;
        spawnY = (state.random() - 0.5) * config.emitterHeight;
        spawnZ = (state.random() - 0.5) * config.emitterDepth;
      } else {
        // 2D shapes: point, circle, rect — velocity uses the 2D spread angle.
        const angle = baseAngle + (state.random() - 0.5) * 2 * config.spread;
        vx = Math.cos(angle) * speed;
        vy = Math.sin(angle) * speed;
        vz = 0;

        if (shape === 'circle' && config.emitterRadius > 0) {
          const r = Math.sqrt(state.random()) * config.emitterRadius;
          const a = state.random() * TWO_PI;
          spawnX = Math.cos(a) * r;
          spawnY = Math.sin(a) * r;
        } else if (shape === 'rect' && (config.emitterWidth > 0 || config.emitterHeight > 0)) {
          spawnX = (state.random() - 0.5) * config.emitterWidth;
          spawnY = (state.random() - 0.5) * config.emitterHeight;
        }
      }

      // World-space: transform spawn position and velocity into world space,
      // and distribute origins along the emitter's movement path (trail interpolation).
      if (worldTransform !== null) {
        const wt = worldTransform;
        // Trail: interpolate origin between prev and current world position
        const t = toSpawn > 1 ? sIdx / (toSpawn - 1) : 1;
        const originX = prevPathX + (trackX - prevPathX) * t;
        const originY = prevPathY + (trackY - prevPathY) * t;
        // Apply rotation+scale of world transform to shape offset, then add trail origin
        const wx = wt.a * spawnX + wt.c * spawnY + originX;
        const wy = wt.b * spawnX + wt.d * spawnY + originY;
        spawnX = wx;
        spawnY = wy;
        // Z is unaffected by the 2D world transform.
        // Rotate velocity by world transform (no translation for vectors)
        const wvx = wt.a * vx + wt.c * vy;
        const wvy = wt.b * vx + wt.d * vy;
        vx = wvx;
        vy = wvy;
        // vz is unaffected by the 2D world transform.
      }

      // Velocity inheritance: blend emitter velocity into new particle velocity
      if (hasVelInherit && !isNaN(state.prevX)) {
        vx += emitterVelX * config.velocityInheritance;
        vy += emitterVelY * config.velocityInheritance;
      }

      const vt = idx * PARTICLE_VELOCITY_STRIDE;
      state.velocities[vt] = vx;
      state.velocities[vt + 1] = vy;
      state.velocities[vt + 2] = vz;

      const spawnScale = config.scaleMin + state.random() * (config.scaleMax - config.scaleMin);
      state.scales[idx] = spawnScale;

      const tt = idx * PARTICLE_TRANSFORM_STRIDE;
      data.transforms[tt] = spawnX;
      data.transforms[tt + 1] = spawnY;
      // For 2D shapes the angle is used as rotation; for 3D shapes use baseAngle as a fallback.
      const spawnAngle =
        shape === 'sphere' || shape === 'cone3d' ? baseAngle : baseAngle + (state.random() - 0.5) * 2 * config.spread;
      // Use the already-computed angle for 2D shapes — but for 3D shapes we compute velocity
      // differently, so store a neutral rotation from the direction vector.
      data.transforms[tt + 2] =
        shape === 'sphere' || shape === 'cone3d' || shape === 'box' ? Math.atan2(vy, vx) : spawnAngle;
      data.transforms[tt + 3] = hasScaleCurve ? spawnScale * sampleParticleCurve(scaleCurve, 0) : spawnScale;
      data.positionsZ[idx] = spawnZ;
      data.alphas[idx] = hasAlphaCurve ? sampleParticleCurve(alphaCurve, 0) : config.alphaStart;

      // Color — curve takes precedence, then per-particle variance, then constants
      const ct = idx * 3;
      if (hasColorCurve) {
        sampleParticleColorCurve(data.colors, ct, colorCurve, 0);
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

      onSpawn?.(spawnX, spawnY, 0);
      if (signals !== null) {
        signals.onParticleSpawn.emit(spawnX, spawnY, 0, state.velocities[vt], state.velocities[vt + 1], 0);
      }
    }
    data.particleCount = newCount;
  }

  // Update prev-position tracking for next frame.
  state.prevX = trackX;
  state.prevY = trackY;

  // Mirror the live per-particle velocities into the render data so the velocity G-buffer writer can
  // smear each particle by its own vector. The sim velocities are stride-3 (vx, vy, vz) while the
  // render velocities are stride-2 (vx, vy), so we copy component-wise.
  const liveRenderVelocityCount = data.particleCount * 2;
  if (data.velocities.length >= liveRenderVelocityCount) {
    for (let vi = 0; vi < data.particleCount; vi++) {
      const src = vi * PARTICLE_VELOCITY_STRIDE;
      const dst = vi * 2;
      data.velocities[dst] = state.velocities[src];
      data.velocities[dst + 1] = state.velocities[src + 1];
    }
  }

  // Fire onEmitterComplete when a finite emitter has just finished and all particles are gone.
  if (signals !== null && isParticleEmitterComplete(emitter, state, config)) {
    signals.onEmitterComplete.emit();
  }

  invalidateNodeLocalBounds(emitter);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Rotate a local direction (lx, ly, lz) from z-axis alignment to the target direction (dx, dy, dz).
// Uses Rodrigues' rotation formula. Returns [rx, ry, rz].
const _rot: [number, number, number] = [0, 0, 0];
function rotateToDirection(
  lx: number,
  ly: number,
  lz: number,
  dx: number,
  dy: number,
  dz: number,
): [number, number, number] {
  // Cross product of z-axis (0,0,1) with direction = (-dy, dx, 0)
  const kx = -dy;
  const ky = dx;
  // kz = 0
  const sinAngle = Math.sqrt(kx * kx + ky * ky);
  const cosAngle = dz; // dot(z-axis, dir)

  if (sinAngle < 1e-6) {
    // Direction is nearly aligned with z-axis (or anti-aligned).
    if (cosAngle > 0) {
      _rot[0] = lx;
      _rot[1] = ly;
      _rot[2] = lz;
    } else {
      // 180-degree flip: negate z
      _rot[0] = lx;
      _rot[1] = -ly;
      _rot[2] = -lz;
    }
    return _rot;
  }

  // Normalized rotation axis
  const invSin = 1 / sinAngle;
  const ax = kx * invSin;
  const ay = ky * invSin;
  // az = 0

  // Rodrigues: v' = v*cos + (k cross v)*sin + k*(k dot v)*(1-cos)
  const kdotv = ax * lx + ay * ly; // az=0

  // k cross v (k=(ax,ay,0), v=(lx,ly,lz)):
  // k x v = (ay*lz - 0*ly, 0*lx - ax*lz, ax*ly - ay*lx)
  const crossX = ay * lz;
  const crossY = -ax * lz;
  const crossZ = ax * ly - ay * lx;

  _rot[0] = lx * cosAngle + crossX * sinAngle + ax * kdotv * (1 - cosAngle);
  _rot[1] = ly * cosAngle + crossY * sinAngle + ay * kdotv * (1 - cosAngle);
  _rot[2] = lz * cosAngle + crossZ * sinAngle + 0; // az=0, so last term is 0
  return _rot;
}

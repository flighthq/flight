import {
  PARTICLE_VELOCITY_STRIDE,
  ensureParticleEmitterStateCapacity,
  getParticleEmitterSignals,
  sampleParticleColorCurve,
  sampleParticleCurve,
} from '@flighthq/particles';
import type {
  Matrix4,
  ParticleEmitter3D,
  ParticleEmitterCallbacks,
  ParticleEmitterConfig,
  ParticleEmitterState,
} from '@flighthq/types';

import { reserveParticleEmitter3D } from './particleEmitter3D';

const PARTICLE_TRANSFORM_STRIDE = 4;
const TWO_PI = Math.PI * 2;

export function isParticleEmitter3DComplete(
  emitter: ParticleEmitter3D,
  state: Readonly<ParticleEmitterState>,
  config: Readonly<ParticleEmitterConfig>,
): boolean {
  if (config.duration <= 0 || config.loop) return false;
  return state.emitterAge >= config.duration && emitter.data.particleCount === 0;
}

function isEmitting(config: Readonly<ParticleEmitterConfig>, emitterAge: number): boolean {
  return config.duration <= 0 || config.loop || emitterAge < config.duration;
}

export function updateParticleEmitter3D(
  emitter: ParticleEmitter3D,
  state: ParticleEmitterState,
  config: Readonly<ParticleEmitterConfig>,
  deltaTime: number,
  callbacks?: ParticleEmitterCallbacks,
  // When config.worldSpace is set, this is the emitter's world transform: new particles are baked into
  // world space at spawn (position through the full matrix, velocity through its rotation) so they stay
  // put as the emitter moves — the renderer then draws them without re-applying the emitter transform.
  // Omit it (or leave config.worldSpace false) for the default emitter-local behavior. Named to mirror
  // the 2D updateParticleEmitter's worldTransform; the 3D transform is a full Matrix4.
  worldTransform?: Readonly<Matrix4>,
): void {
  const data = emitter.data;
  const worldM = config.worldSpace && worldTransform != null ? worldTransform.m : null;
  // Only claim world-space to the renderer when spawns are actually baked. Setting it from config alone
  // would tell the renderer to skip the node transform while particles were never baked — misplacing them.
  data.worldSpace = worldM !== null;

  if (deltaTime <= 0) return;

  // Emitter origin this frame: the world translation when baking to world space, else the node's local
  // translation. Tracked frame-to-frame (state.prev*) to derive the emitter's own velocity for velocity
  // inheritance and to spread world-space spawns along the emitter's path (trail interpolation).
  const lm = emitter.localMatrix.m;
  const trackX = worldM !== null ? worldM[12] : lm[12];
  const trackY = worldM !== null ? worldM[13] : lm[13];
  const trackZ = worldM !== null ? worldM[14] : lm[14];
  const hasVelInherit = config.velocityInheritance !== 0;
  let emitterVelX = 0;
  let emitterVelY = 0;
  let emitterVelZ = 0;
  if (!isNaN(state.prevX)) {
    emitterVelX = (trackX - state.prevX) / deltaTime;
    emitterVelY = (trackY - state.prevY) / deltaTime;
    emitterVelZ = (trackZ - state.prevZ) / deltaTime;
  }

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
  const signals = getParticleEmitterSignals(state);
  const onDeath = callbacks?.onDeath;
  const onSpawn = callbacks?.onSpawn;

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
        const dz = positionsZ[i];
        onDeath?.(dx, dy, dz);
        signals?.onParticleDeath.emit(dx, dy, dz);
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
    reserveParticleEmitter3D(emitter, newCount);
    ensureParticleEmitterStateCapacity(state, newCount, hasColorVariance);

    const baseAngle = Math.atan2(config.directionY, config.directionX);
    const regionRange = config.regionIdMax - config.regionIdMin;
    const regionIdMin = config.regionIdMin;
    const rotSpeedRange = config.rotationSpeedMax - config.rotationSpeedMin;
    const hasRotSpeed = config.rotationSpeedMin !== 0 || config.rotationSpeedMax !== 0;

    const dirLen = Math.sqrt(
      config.directionX * config.directionX +
        config.directionY * config.directionY +
        config.directionZ * config.directionZ,
    );
    const dirNx = dirLen > 1e-6 ? config.directionX / dirLen : 0;
    const dirNy = dirLen > 1e-6 ? config.directionY / dirLen : -1;
    const dirNz = dirLen > 1e-6 ? config.directionZ / dirLen : 0;

    // World-space trail: distribute this frame's spawn origins along the path prevPos → currentPos so a
    // fast-moving emitter lays a continuous ribbon instead of one clump per frame. Only in world space
    // (where particles are left behind) and only once a previous position exists (not the first frame).
    const doTrail = worldM !== null && !isNaN(state.prevX);
    const prevPathX = doTrail ? state.prevX : trackX;
    const prevPathY = doTrail ? state.prevY : trackY;
    const prevPathZ = doTrail ? state.prevZ : trackZ;

    for (let sIdx = 0; sIdx < toSpawn; sIdx++) {
      const idx = liveCount + sIdx;

      const lifetime = config.lifetimeMin + state.random() * (config.lifetimeMax - config.lifetimeMin);
      const lt = idx * 2;
      state.lifetimes[lt] = 0;
      state.lifetimes[lt + 1] = lifetime;

      const speed = config.speedMin + state.random() * (config.speedMax - config.speedMin);
      let vx: number;
      let vy: number;
      let vz: number;

      let spawnX = 0;
      let spawnY = 0;
      let spawnZ = 0;

      const shape = config.emitterShape;
      if (shape === 'sphere' || shape === 'cone3d') {
        let sx: number;
        let sy: number;
        let sz: number;
        if (shape === 'cone3d' && config.emitterConeAngle > 0) {
          const coneHalf = config.emitterConeAngle / 2;
          const cosTheta = 1 - state.random() * (1 - Math.cos(coneHalf));
          const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
          const phi = state.random() * TWO_PI;
          const lx = sinTheta * Math.cos(phi);
          const ly = sinTheta * Math.sin(phi);
          const lz = cosTheta;
          const rDir = rotateToDirection(lx, ly, lz, dirNx, dirNy, dirNz);
          sx = rDir[0];
          sy = rDir[1];
          sz = rDir[2];
        } else {
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

        if (config.emitterRadius > 0) {
          const r = Math.cbrt(state.random()) * config.emitterRadius;
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
        const angle = baseAngle + (state.random() - 0.5) * 2 * config.spread;
        vx = Math.cos(angle) * speed;
        vy = Math.sin(angle) * speed;
        vz = (config.directionZ * speed) / (dirLen > 1e-6 ? dirLen : 1);
        spawnX = (state.random() - 0.5) * config.emitterWidth;
        spawnY = (state.random() - 0.5) * config.emitterHeight;
        spawnZ = (state.random() - 0.5) * config.emitterDepth;
      } else {
        // 2D shapes: point, circle, rect
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

      // World-space: bake the spawn position and velocity into world space so the particle no longer
      // rides the emitter's transform. The shape offset goes through the rotation+scale (upper 3×3); the
      // origin is the interpolated trail point, which collapses to the current position when not trailing.
      if (worldM !== null) {
        const m = worldM;
        const t = toSpawn > 1 ? sIdx / (toSpawn - 1) : 1;
        const originX = prevPathX + (trackX - prevPathX) * t;
        const originY = prevPathY + (trackY - prevPathY) * t;
        const originZ = prevPathZ + (trackZ - prevPathZ) * t;
        const px = m[0] * spawnX + m[4] * spawnY + m[8] * spawnZ + originX;
        const py = m[1] * spawnX + m[5] * spawnY + m[9] * spawnZ + originY;
        const pz = m[2] * spawnX + m[6] * spawnY + m[10] * spawnZ + originZ;
        const wvx = m[0] * vx + m[4] * vy + m[8] * vz;
        const wvy = m[1] * vx + m[5] * vy + m[9] * vz;
        const wvz = m[2] * vx + m[6] * vy + m[10] * vz;
        spawnX = px;
        spawnY = py;
        spawnZ = pz;
        vx = wvx;
        vy = wvy;
        vz = wvz;
      }

      // Velocity inheritance: blend a fraction of the emitter's own motion into the new particle, so
      // particles shed from a moving emitter carry its momentum.
      if (hasVelInherit && !isNaN(state.prevX)) {
        vx += emitterVelX * config.velocityInheritance;
        vy += emitterVelY * config.velocityInheritance;
        vz += emitterVelZ * config.velocityInheritance;
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
      data.transforms[tt + 2] =
        shape === 'sphere' || shape === 'cone3d' || shape === 'box'
          ? Math.atan2(vy, vx)
          : baseAngle + (state.random() - 0.5) * 2 * config.spread;
      data.transforms[tt + 3] = hasScaleCurve ? spawnScale * sampleParticleCurve(scaleCurve, 0) : spawnScale;
      data.positionsZ[idx] = spawnZ;
      data.alphas[idx] = hasAlphaCurve ? sampleParticleCurve(alphaCurve, 0) : config.alphaStart;

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

      onSpawn?.(spawnX, spawnY, spawnZ);
      if (signals !== null) {
        signals.onParticleSpawn.emit(spawnX, spawnY, spawnZ, vx, vy, vz);
      }
    }
    data.particleCount = newCount;
  }

  // Remember the emitter origin for next frame's velocity/trail derivation.
  state.prevX = trackX;
  state.prevY = trackY;
  state.prevZ = trackZ;

  // Mirror the simulated velocities into the emitter's own buffer so getParticleEmitter3DParticleVelocity
  // and manual entity ops observe them. Both are stride-3 (vx, vy, vz).
  const liveVelocityCount = data.particleCount * PARTICLE_VELOCITY_STRIDE;
  if (data.velocities.length >= liveVelocityCount) {
    for (let vi = 0; vi < liveVelocityCount; vi++) {
      data.velocities[vi] = state.velocities[vi];
    }
  }

  if (signals !== null && isParticleEmitter3DComplete(emitter, state, config)) {
    signals.onEmitterComplete.emit();
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

const _rot: [number, number, number] = [0, 0, 0];
function rotateToDirection(
  lx: number,
  ly: number,
  lz: number,
  dx: number,
  dy: number,
  dz: number,
): [number, number, number] {
  const kx = -dy;
  const ky = dx;
  const sinAngle = Math.sqrt(kx * kx + ky * ky);
  const cosAngle = dz;

  if (sinAngle < 1e-6) {
    if (cosAngle > 0) {
      _rot[0] = lx;
      _rot[1] = ly;
      _rot[2] = lz;
    } else {
      _rot[0] = lx;
      _rot[1] = -ly;
      _rot[2] = -lz;
    }
    return _rot;
  }

  const invSin = 1 / sinAngle;
  const ax = kx * invSin;
  const ay = ky * invSin;

  const kdotv = ax * lx + ay * ly;
  const crossX = ay * lz;
  const crossY = -ax * lz;
  const crossZ = ax * ly - ay * lx;

  _rot[0] = lx * cosAngle + crossX * sinAngle + ax * kdotv * (1 - cosAngle);
  _rot[1] = ly * cosAngle + crossY * sinAngle + ay * kdotv * (1 - cosAngle);
  _rot[2] = lz * cosAngle + crossZ * sinAngle;
  return _rot;
}

import {
  PARTICLE_VELOCITY_STRIDE,
  ensureParticleEmitterStateCapacity,
  sampleParticleColorCurve,
  sampleParticleCurve,
} from '@flighthq/particles';
import type { ParticleEmitter3D } from '@flighthq/types';
import type { ParticleEmitterConfig, ParticleEmitterState } from '@flighthq/types';

import { reserveParticleEmitter3D } from './particleEmitter3D';

const PARTICLE_TRANSFORM_STRIDE = 4;
const TWO_PI = Math.PI * 2;

export function emitParticleBurst3D(
  emitter: ParticleEmitter3D,
  state: ParticleEmitterState,
  config: Readonly<ParticleEmitterConfig>,
  count: number,
  x: number,
  y: number,
  z: number,
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
  reserveParticleEmitter3D(emitter, newCount);
  ensureParticleEmitterStateCapacity(state, newCount, hasColorVariance);

  const { colorStartR, colorStartG, colorStartB, colorEndR, colorEndG, colorEndB } = config;
  const alphaCurve = config.alphaCurve;
  const colorCurve = config.colorCurve;
  const scaleCurve = config.scaleCurve;
  const hasAlphaCurve = alphaCurve != null && alphaCurve.length > 0;
  const hasColorCurve = colorCurve != null && colorCurve.length >= 3;
  const hasScaleCurve = scaleCurve != null && scaleCurve.length > 0;
  const regionRange = config.regionIdMax - config.regionIdMin;
  const regionIdMin = config.regionIdMin;
  const rotSpeedRange = config.rotationSpeedMax - config.rotationSpeedMin;
  const hasRotSpeed = config.rotationSpeedMin !== 0 || config.rotationSpeedMax !== 0;
  const random = state.random;

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

    const lifetime = config.lifetimeMin + random() * (config.lifetimeMax - config.lifetimeMin);
    const lt = idx * 2;
    state.lifetimes[lt] = 0;
    state.lifetimes[lt + 1] = lifetime;

    const speed = config.speedMin + random() * (config.speedMax - config.speedMin);
    let vx: number;
    let vy: number;
    let vz: number;

    let spawnX = x;
    let spawnY = y;
    let spawnZ = z;

    const shape = config.emitterShape;
    if (shape === 'sphere' || shape === 'cone3d') {
      let sx: number;
      let sy: number;
      let sz: number;
      if (shape === 'cone3d' && config.emitterConeAngle > 0) {
        const coneHalf = config.emitterConeAngle / 2;
        const cosTheta = 1 - random() * (1 - Math.cos(coneHalf));
        const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
        const phi = random() * TWO_PI;
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
          u = random() * 2 - 1;
          v = random() * 2 - 1;
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
        const r = Math.cbrt(random()) * config.emitterRadius;
        let pu: number;
        let pv: number;
        let ps2: number;
        do {
          pu = random() * 2 - 1;
          pv = random() * 2 - 1;
          ps2 = pu * pu + pv * pv;
        } while (ps2 >= 1 || ps2 === 0);
        const pf = 2 * Math.sqrt(1 - ps2);
        spawnX += pu * pf * r;
        spawnY += pv * pf * r;
        spawnZ += (1 - 2 * ps2) * r;
      }
    } else {
      // Burst at a point: use the 2D spread angle for velocity direction.
      const baseAngle = Math.atan2(config.directionY, config.directionX);
      const angle = baseAngle + (random() - 0.5) * 2 * config.spread;
      vx = Math.cos(angle) * speed;
      vy = Math.sin(angle) * speed;
      vz = (config.directionZ * speed) / (dirLen > 1e-6 ? dirLen : 1);

      if (shape === 'box') {
        spawnX += (random() - 0.5) * config.emitterWidth;
        spawnY += (random() - 0.5) * config.emitterHeight;
        spawnZ += (random() - 0.5) * config.emitterDepth;
      } else if (shape === 'circle' && config.emitterRadius > 0) {
        const r = Math.sqrt(random()) * config.emitterRadius;
        const a = random() * TWO_PI;
        spawnX += Math.cos(a) * r;
        spawnY += Math.sin(a) * r;
      } else if (shape === 'rect' && (config.emitterWidth > 0 || config.emitterHeight > 0)) {
        spawnX += (random() - 0.5) * config.emitterWidth;
        spawnY += (random() - 0.5) * config.emitterHeight;
      }
    }

    const vt = idx * PARTICLE_VELOCITY_STRIDE;
    state.velocities[vt] = vx;
    state.velocities[vt + 1] = vy;
    state.velocities[vt + 2] = vz;

    const spawnScale = config.scaleMin + random() * (config.scaleMax - config.scaleMin);
    state.scales[idx] = spawnScale;

    const tt = idx * PARTICLE_TRANSFORM_STRIDE;
    data.transforms[tt] = spawnX;
    data.transforms[tt + 1] = spawnY;
    data.transforms[tt + 2] = Math.atan2(vy, vx);
    data.transforms[tt + 3] = hasScaleCurve ? spawnScale * sampleParticleCurve(scaleCurve, 0) : spawnScale;
    data.positionsZ[idx] = spawnZ;
    data.alphas[idx] = hasAlphaCurve ? sampleParticleCurve(alphaCurve, 0) : config.alphaStart;

    const ct = idx * 3;
    if (hasColorCurve) {
      sampleParticleColorCurve(data.colors, ct, colorCurve, 0);
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

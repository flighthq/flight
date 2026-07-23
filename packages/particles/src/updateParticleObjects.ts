import type {
  ParticleEmitterConfig,
  ParticleObject,
  ParticleObjectsState,
  ParticleObjectsUpdateOptions,
} from '@flighthq/types';

import { sampleParticleCurve } from './curve';
import { ensureParticleObjectsStateCapacity } from './particleObjectsState';

const TWO_PI = Math.PI * 2;

/** True once a finite, non-looping object emitter has finished emitting AND all of
 *  its objects are dead (invisible) — a one-shot effect that is safe to recycle.
 *  Always false for infinite or looping emitters (they never finish). */
export function isParticleObjectsComplete(
  objects: readonly ParticleObject[],
  state: Readonly<ParticleObjectsState>,
  config: Readonly<ParticleEmitterConfig>,
): boolean {
  if (config.duration <= 0 || config.loop) return false;
  if (state.emitterAge < config.duration) return false;
  for (let i = 0; i < objects.length; i++) {
    if (objects[i].visible) return false;
  }
  return true;
}

export function updateParticleObjects(
  objects: readonly ParticleObject[],
  state: ParticleObjectsState,
  config: Readonly<ParticleEmitterConfig>,
  deltaTime: number,
  options?: ParticleObjectsUpdateOptions,
): void {
  const n = objects.length;
  if (n === 0) return;
  // Skip zero/negative time steps: nothing to simulate, and it avoids dividing by
  // deltaTime for velocity inheritance (which would otherwise produce Infinity/NaN
  // velocities on a zero-deltaTime frame and permanently corrupt spawned objects).
  if (deltaTime <= 0) return;
  ensureParticleObjectsStateCapacity(state, n);

  const { lifetimes, velocities, scales, rotationSpeeds } = state;
  const gx = config.gravityX * deltaTime;
  const gy = config.gravityY * deltaTime;
  // Opt-in lifetime curves (objects have alpha + scale; color lives on the
  // typed-array emitter). Absent curves keep the original linear path.
  const alphaCurve = config.alphaCurve;
  const scaleCurve = config.scaleCurve;
  const hasAlphaCurve = alphaCurve != null && alphaCurve.length > 0;
  const hasScaleCurve = scaleCurve != null && scaleCurve.length > 0;
  const hasScaleAnim = config.scaleEnd !== 1 || hasScaleCurve;
  const hasRotSpeed = config.rotationSpeedMin !== 0 || config.rotationSpeedMax !== 0;

  // Emitter velocity for inheritance
  const emitterX = options?.emitterX ?? NaN;
  const emitterY = options?.emitterY ?? NaN;
  let emitterVelX = 0;
  let emitterVelY = 0;
  if (config.velocityInheritance !== 0 && !isNaN(emitterX) && !isNaN(state.prevX)) {
    emitterVelX = (emitterX - state.prevX) / deltaTime;
    emitterVelY = (emitterY - state.prevY) / deltaTime;
  }

  // Phase 1: update live objects, kill expired ones.
  const onDeath = options?.callbacks?.onDeath;
  for (let i = 0; i < n; i++) {
    const lt = i * 2;
    if (lifetimes[lt + 1] <= 0) continue;
    lifetimes[lt] += deltaTime;
    if (lifetimes[lt] >= lifetimes[lt + 1]) {
      lifetimes[lt + 1] = 0;
      objects[i].visible = false;
      onDeath?.();
      continue;
    }
    const vt = i * 2;
    velocities[vt] += gx;
    velocities[vt + 1] += gy;
    objects[i].x += velocities[vt] * deltaTime;
    objects[i].y += velocities[vt + 1] * deltaTime;
    const lifeFraction = lifetimes[lt] / lifetimes[lt + 1];
    objects[i].alpha = hasAlphaCurve
      ? sampleParticleCurve(alphaCurve, lifeFraction)
      : config.alphaStart + (config.alphaEnd - config.alphaStart) * lifeFraction;
    if (hasScaleAnim) {
      const factor = hasScaleCurve
        ? sampleParticleCurve(scaleCurve, lifeFraction)
        : 1 + (config.scaleEnd - 1) * lifeFraction;
      const s = scales[i] * factor;
      objects[i].scaleX = s;
      objects[i].scaleY = s;
    }
    if (hasRotSpeed) {
      objects[i].rotation += rotationSpeeds[i] * deltaTime;
    }
  }

  // Phase 2: emission. A finite, non-looping emitter stops spawning once its
  // duration elapses; live objects keep ageing out (use isParticleObjectsComplete).
  const emitting = config.duration <= 0 || config.loop || state.emitterAge < config.duration;
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

  // Phase 3: spawn into dead slots.
  if (toSpawn > 0) {
    const baseAngle = Math.atan2(config.directionY, config.directionX);
    const rotSpeedRange = config.rotationSpeedMax - config.rotationSpeedMin;
    const onSpawn = options?.callbacks?.onSpawn;

    for (let i = 0; i < n && toSpawn > 0; i++) {
      const lt = i * 2;
      if (lifetimes[lt + 1] > 0) continue;

      const lifetime = config.lifetimeMin + state.random() * (config.lifetimeMax - config.lifetimeMin);
      lifetimes[lt] = 0;
      lifetimes[lt + 1] = lifetime;

      const angle = baseAngle + (state.random() - 0.5) * 2 * config.spread;
      const speed = config.speedMin + state.random() * (config.speedMax - config.speedMin);
      const vt = i * 2;
      velocities[vt] =
        Math.cos(angle) * speed + (config.velocityInheritance !== 0 ? emitterVelX * config.velocityInheritance : 0);
      velocities[vt + 1] =
        Math.sin(angle) * speed + (config.velocityInheritance !== 0 ? emitterVelY * config.velocityInheritance : 0);

      // Spawn position offset from emitter shape
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

      const spawnScale = config.scaleMin + state.random() * (config.scaleMax - config.scaleMin);
      scales[i] = spawnScale;
      rotationSpeeds[i] = hasRotSpeed ? config.rotationSpeedMin + state.random() * rotSpeedRange : 0;

      const obj = objects[i];
      obj.x = spawnX;
      obj.y = spawnY;
      obj.rotation = angle;
      const spawnFactor = hasScaleCurve ? spawnScale * sampleParticleCurve(scaleCurve, 0) : spawnScale;
      obj.scaleX = spawnFactor;
      obj.scaleY = spawnFactor;
      obj.alpha = hasAlphaCurve ? sampleParticleCurve(alphaCurve, 0) : config.alphaStart;
      obj.visible = true;
      toSpawn--;
      onSpawn?.(spawnX, spawnY);
    }
  }

  // Track emitter position for next frame's velocity inheritance.
  if (!isNaN(emitterX)) {
    state.prevX = emitterX;
    state.prevY = emitterY;
  }
}

import type { HasAppearance, HasTransform2D } from '@flighthq/types';

import type { ParticleEmitterConfig } from './particleEmitterConfig';
import type { ParticleObjectsState } from './particleObjectsState';
import { ensureParticleObjectsStateCapacity } from './particleObjectsState';

export type ParticleObject = HasTransform2D & HasAppearance;

export function updateParticleObjects(
  objects: readonly ParticleObject[],
  state: ParticleObjectsState,
  config: Readonly<ParticleEmitterConfig>,
  dt: number,
): void {
  const n = objects.length;
  if (n === 0) return;
  ensureParticleObjectsStateCapacity(state, n);

  const { lifetimes, velocities } = state;
  const gx = config.gravityX * dt;
  const gy = config.gravityY * dt;

  // Update live objects: age, integrate, alpha fade. Kill expired ones.
  for (let i = 0; i < n; i++) {
    const lt = i * 2;
    if (lifetimes[lt + 1] <= 0) continue; // dead slot
    lifetimes[lt] += dt;
    if (lifetimes[lt] >= lifetimes[lt + 1]) {
      lifetimes[lt + 1] = 0;
      objects[i].visible = false;
      continue;
    }
    const vt = i * 2;
    velocities[vt] += gx;
    velocities[vt + 1] += gy;
    objects[i].x += velocities[vt] * dt;
    objects[i].y += velocities[vt + 1] * dt;
    const lifeFraction = lifetimes[lt] / lifetimes[lt + 1];
    objects[i].alpha = config.alphaStart + (config.alphaEnd - config.alphaStart) * lifeFraction;
  }

  // Spawn into dead slots.
  state.spawnAccumulator += config.spawnRate * dt;
  let toSpawn = Math.floor(state.spawnAccumulator);
  state.spawnAccumulator -= toSpawn;

  if (toSpawn > 0) {
    const baseAngle = Math.atan2(config.directionY, config.directionX);
    for (let i = 0; i < n && toSpawn > 0; i++) {
      const lt = i * 2;
      if (lifetimes[lt + 1] > 0) continue; // slot occupied
      const lifetime = config.lifetimeMin + Math.random() * (config.lifetimeMax - config.lifetimeMin);
      lifetimes[lt] = 0;
      lifetimes[lt + 1] = lifetime;
      const angle = baseAngle + (Math.random() - 0.5) * 2 * config.spread;
      const speed = config.speedMin + Math.random() * (config.speedMax - config.speedMin);
      const vt = i * 2;
      velocities[vt] = Math.cos(angle) * speed;
      velocities[vt + 1] = Math.sin(angle) * speed;
      const obj = objects[i];
      obj.x = 0;
      obj.y = 0;
      obj.rotation = angle;
      const scale = config.scaleMin + Math.random() * (config.scaleMax - config.scaleMin);
      obj.scaleX = scale;
      obj.scaleY = scale;
      obj.alpha = config.alphaStart;
      obj.visible = true;
      toSpawn--;
    }
  }
}

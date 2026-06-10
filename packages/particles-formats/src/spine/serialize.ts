import type { ParticleEmitterConfig } from '@flighthq/particles';

import type { SpineParticleDocument } from './schema';

const RAD2DEG = 180 / Math.PI;

function rgbToHex(r: number, g: number, b: number): string {
  const byte = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `${byte(r)}${byte(g)}${byte(b)}`;
}

function configToDocument(
  config: Readonly<ParticleEmitterConfig>,
  existing: Partial<SpineParticleDocument>,
): SpineParticleDocument {
  const angleMid = Math.atan2(-config.directionY, config.directionX) * RAD2DEG;
  const spreadDeg = config.spread * RAD2DEG;

  return {
    name: existing.name ?? '',
    maxParticles: config.maxParticles,
    continuous: existing.continuous ?? true,
    duration: existing.duration ?? -1,
    emission: { low: config.spawnRate * 0.8, high: config.spawnRate * 1.2 },
    life: { low: config.lifetimeMin * 1000, high: config.lifetimeMax * 1000 },
    lifeOffset: existing.lifeOffset ?? { low: 0, high: 0 },
    x: existing.x ?? { low: 0, high: 0 },
    y: existing.y ?? { low: 0, high: 0 },
    spawnShape: config.emitterShape === 'rect' ? 'ellipse' : config.emitterShape === 'circle' ? 'ellipse' : 'point',
    spawnWidth:
      config.emitterShape === 'circle'
        ? { low: config.emitterRadius * 2, high: config.emitterRadius * 2 }
        : config.emitterShape === 'rect'
          ? { low: config.emitterWidth, high: config.emitterWidth }
          : { low: 0, high: 0 },
    spawnHeight:
      config.emitterShape === 'circle'
        ? { low: config.emitterRadius * 2, high: config.emitterRadius * 2 }
        : config.emitterShape === 'rect'
          ? { low: config.emitterHeight, high: config.emitterHeight }
          : { low: 0, high: 0 },
    velocity: { low: config.speedMin, high: config.speedMax },
    angle: { low: angleMid - spreadDeg, high: angleMid + spreadDeg },
    rotation: { low: config.rotationSpeedMin * RAD2DEG, high: config.rotationSpeedMax * RAD2DEG },
    wind: { low: 0, high: 0 }, // gravityX not representable as wind range
    gravity: { low: config.gravityY, high: config.gravityY },
    scale: { low: config.scaleMin, high: config.scaleMax },
    scaleEnd: {
      low: config.scaleMin * config.scaleEnd,
      high: config.scaleMax * config.scaleEnd,
    },
    tint: [
      { time: 0, color: rgbToHex(config.colorStartR, config.colorStartG, config.colorStartB) },
      { time: 1, color: rgbToHex(config.colorEndR, config.colorEndG, config.colorEndB) },
    ],
    alpha: [
      { time: 0, alpha: config.alphaStart },
      { time: 1, alpha: config.alphaEnd },
    ],
    blendMode: existing.blendMode ?? 'normal',
    premultiplied: existing.premultiplied ?? false,
    images: existing.images ?? [],
  };
}

/** Serialise a ParticleEmitterConfig to a Spine particle effect JSON string.
 *
 *  Pass the `document` returned by `parseSpineParticle` to preserve fields
 *  that don't round-trip through the config (name, image list, blend mode, etc.). */
export function serializeSpineParticle(
  config: Readonly<ParticleEmitterConfig>,
  existing?: Partial<SpineParticleDocument>,
): string {
  const doc = configToDocument(config, existing ?? {});
  return JSON.stringify(doc, null, 2);
}

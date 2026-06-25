import { particleColorCurveToKeyframes, particleCurveToKeyframes } from '@flighthq/particles';
import type { ParticleBlendMode, ParticleEmitterConfig } from '@flighthq/types';

import type { ParticleSerializeResult } from './serializeResult';
import type { SpineAlphaKeyframe, SpineParticleDocument, SpineTintKeyframe } from './spineSchema';

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
    continuous: config.loop,
    duration: config.duration > 0 && !config.loop ? config.duration * 1000 : (existing.duration ?? -1),
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
    // A baked color/alpha curve serializes back to a full multi-stop timeline;
    // otherwise emit the 2-stop start→end timeline.
    tint: config.colorCurve
      ? particleColorCurveToKeyframes(config.colorCurve).map(
          (k): SpineTintKeyframe => ({ time: k.time, color: rgbToHex(k.r, k.g, k.b) }),
        )
      : [
          { time: 0, color: rgbToHex(config.colorStartR, config.colorStartG, config.colorStartB) },
          { time: 1, color: rgbToHex(config.colorEndR, config.colorEndG, config.colorEndB) },
        ],
    alpha: config.alphaCurve
      ? particleCurveToKeyframes(config.alphaCurve).map((k): SpineAlphaKeyframe => ({ time: k.time, alpha: k.value }))
      : [
          { time: 0, alpha: config.alphaStart },
          { time: 1, alpha: config.alphaEnd },
        ],
    blendMode: configToSpineBlendMode(config.blendMode) ?? existing.blendMode ?? 'normal',
    premultiplied: existing.premultiplied ?? false,
    images: existing.images ?? [],
  };
}

function configToSpineBlendMode(mode: ParticleBlendMode | null): SpineParticleDocument['blendMode'] | null {
  if (mode === 'add') return 'additive';
  if (mode === 'multiply') return 'multiply';
  if (mode === 'screen') return 'screen';
  if (mode === 'normal') return 'normal';
  return null;
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

/** Serialise a ParticleEmitterConfig to a Spine particle effect JSON string,
 *  returning both the serialized text and any warnings for features the format
 *  cannot represent.
 *
 *  Pass the `document` returned by `parseSpineParticleDocument` to preserve
 *  fields that don't round-trip through the config. */
export function serializeSpineParticleDocument(
  config: Readonly<ParticleEmitterConfig>,
  existing?: Partial<SpineParticleDocument>,
): ParticleSerializeResult {
  const text = serializeSpineParticle(config, existing);
  const warnings = collectSpineSerializeWarnings(config);
  return { text, warnings };
}

function collectSpineSerializeWarnings(config: Readonly<ParticleEmitterConfig>): string[] {
  const warnings: string[] = [];
  if (config.burstCount > 0) {
    warnings.push('Emission bursts are not supported by the Spine particle format and were ignored');
  }
  if (config.colorEndVarianceR !== 0 || config.colorEndVarianceG !== 0 || config.colorEndVarianceB !== 0) {
    warnings.push('colorEndVariance is not supported by the Spine format and was ignored');
  }
  if (config.colorStartVarianceR !== 0 || config.colorStartVarianceG !== 0 || config.colorStartVarianceB !== 0) {
    warnings.push('colorStartVariance is not supported by the Spine format and was ignored');
  }
  if (config.velocityInheritance !== 0) {
    warnings.push('velocityInheritance is not supported by the Spine format and was ignored');
  }
  return warnings;
}

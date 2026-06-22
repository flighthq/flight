import { particleColorCurveToKeyframes, particleCurveToKeyframes } from '@flighthq/particles';
import type { ParticleEmitterConfig } from '@flighthq/types';

import type {
  UnityAnimationCurve,
  UnityColor,
  UnityGradient,
  UnityMinMaxValue,
  UnityParticleDocument,
} from './unitySchema';

export interface UnitySerializeOptions {
  /** Pixels-per-unit — reverses the conversion applied during parsing.  Defaults to 100. */
  pixelsPerUnit?: number;
}

const RAD2DEG = 180 / Math.PI;
const DEFAULT_PPU = 100;

function color(r: number, g: number, b: number, a: number): UnityColor {
  return { r, g, b, a };
}
function constant(v: number): UnityMinMaxValue {
  return { mode: 'constant', constant: v };
}
function twoConst(low: number, high: number): UnityMinMaxValue {
  if (low === high) return constant(low);
  return { mode: 'twoConstants', constantMin: low, constantMax: high };
}

function configToDocument(
  config: Readonly<ParticleEmitterConfig>,
  existing: Partial<UnityParticleDocument>,
  ppu: number,
): UnityParticleDocument {
  const rotSpeedDegLow = config.rotationSpeedMin * RAD2DEG;
  const rotSpeedDegHigh = config.rotationSpeedMax * RAD2DEG;
  const hasRotation = config.rotationSpeedMin !== 0 || config.rotationSpeedMax !== 0;
  const hasBurst = config.burstCount > 0;

  // Gravity: pixel/s² → Unity world units / s²
  const gravWorldUnit = config.gravityY / ppu;
  const physicsGravity = existing.physicsGravity ?? 9.81;
  const gravModifier = physicsGravity !== 0 ? gravWorldUnit / physicsGravity : 0;

  // Shape
  let shapeType: UnityParticleDocument['shape']['shapeType'] = 'Cone';
  let radius = 0;
  let angle = config.spread * RAD2DEG;
  const scaleXY = 1;

  if (config.emitterShape === 'circle') {
    shapeType = 'Circle';
    radius = config.emitterRadius / ppu;
    angle = 0;
  } else if (config.emitterShape === 'rect') {
    shapeType = 'Box';
  }

  return {
    name: existing.name ?? '',
    duration: config.duration > 0 ? config.duration : (existing.duration ?? 5),
    looping: config.loop,
    prewarm: existing.prewarm ?? false,
    maxParticles: config.maxParticles,
    startLifetime: twoConst(config.lifetimeMin, config.lifetimeMax),
    startSpeed: twoConst(config.speedMin / ppu, config.speedMax / ppu),
    startSize: twoConst(config.scaleMin, config.scaleMax),
    startRotation: constant(0),
    startColor: color(config.colorStartR, config.colorStartG, config.colorStartB, config.alphaStart),
    gravityModifier: gravModifier,
    physicsGravity,
    emission: {
      rateOverTime: constant(config.spawnRate),
      bursts: hasBurst
        ? [
            {
              time: 0,
              count: config.burstCount,
              cycleCount: config.burstInterval > 0 ? 0 : 1,
              repeatInterval: config.burstInterval,
            },
          ]
        : [],
    },
    shape: {
      enabled: config.emitterShape !== 'point',
      shapeType,
      radius,
      angle,
      scale: {
        x: config.emitterShape === 'rect' ? config.emitterWidth / ppu : scaleXY,
        y: config.emitterShape === 'rect' ? config.emitterHeight / ppu : scaleXY,
        z: 1,
      },
    },
    colorOverLifetime: {
      enabled: true,
      colorStart: color(config.colorStartR, config.colorStartG, config.colorStartB, config.alphaStart),
      colorEnd: color(config.colorEndR, config.colorEndG, config.colorEndB, config.alphaEnd),
      // Emit a full gradient when the config carries baked color/alpha curves so
      // the complete timeline round-trips back out (not just the endpoints).
      ...(config.colorCurve || config.alphaCurve ? { gradient: buildGradient(config) } : {}),
    },
    sizeOverLifetime: {
      enabled: config.scaleEnd !== 1 || config.scaleCurve != null,
      sizeStart: 1,
      sizeEnd: config.scaleEnd,
      ...(config.scaleCurve ? { curve: buildSizeCurve(config.scaleCurve) } : {}),
    },
    rotationOverLifetime: {
      enabled: hasRotation,
      angularVelocity: hasRotation ? twoConst(rotSpeedDegLow, rotSpeedDegHigh) : constant(0),
    },
  };
}

function buildGradient(config: Readonly<ParticleEmitterConfig>): UnityGradient {
  const colorKeys = config.colorCurve
    ? particleColorCurveToKeyframes(config.colorCurve).map((k) => ({ time: k.time, color: { r: k.r, g: k.g, b: k.b } }))
    : [
        { time: 0, color: { r: config.colorStartR, g: config.colorStartG, b: config.colorStartB } },
        { time: 1, color: { r: config.colorEndR, g: config.colorEndG, b: config.colorEndB } },
      ];
  const alphaKeys = config.alphaCurve
    ? particleCurveToKeyframes(config.alphaCurve).map((k) => ({ time: k.time, alpha: k.value }))
    : [
        { time: 0, alpha: config.alphaStart },
        { time: 1, alpha: config.alphaEnd },
      ];
  return { colorKeys, alphaKeys };
}

function buildSizeCurve(scaleCurve: ReadonlyArray<number>): UnityAnimationCurve {
  return { keys: particleCurveToKeyframes(scaleCurve).map((k) => ({ time: k.time, value: k.value })) };
}

/** Serialise a ParticleEmitterConfig to a Unity Shuriken particle system JSON string.
 *
 *  Pass the `document` returned by `parseUnityParticle` to preserve fields that
 *  don't round-trip through the config (name, duration, looping, prewarm, etc.). */
export function serializeUnityParticle(
  config: Readonly<ParticleEmitterConfig>,
  existing?: Partial<UnityParticleDocument>,
  options?: UnitySerializeOptions,
): string {
  const ppu = options?.pixelsPerUnit ?? DEFAULT_PPU;
  const doc = configToDocument(config, existing ?? {}, ppu);
  return JSON.stringify(doc, null, 2);
}

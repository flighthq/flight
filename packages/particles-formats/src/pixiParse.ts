import { createParticleEmitterConfig } from '@flighthq/particles';
import type { ParticleBlendMode, ParticleEmitterConfig } from '@flighthq/types';

export interface PixiParseResult {
  config: ParticleEmitterConfig;
  /** Features present in the source that the common-subset importer cannot
   *  represent and silently dropped — surface these in your asset pipeline. */
  warnings: string[];
}

/** @deprecated Use `PixiParseResult`. */
export type PixiParsed = PixiParseResult;

/** Parse a Pixi.js / pixi-particle-emitter JSON config string directly to a ParticleEmitterConfig.
 *
 *  Supports the pixi-particle-emitter v3/v4/v5 config shape.
 *  Throws a clear, format-tagged error when the input is not valid JSON or not an object. */
export function parsePixiParticle(json: string): ParticleEmitterConfig {
  return rawToConfig(parsePixiJson(json));
}

/** Parse a Pixi.js / pixi-particle-emitter JSON config string, returning the config
 *  and any import warnings for features that could not be represented. */
export function parsePixiParticleDocument(json: string): PixiParseResult {
  const raw = parsePixiJson(json);
  return {
    config: rawToConfig(raw),
    warnings: collectPixiWarnings(raw),
  };
}

const DEG2RAD = Math.PI / 180;

type PixiRaw = Record<string, unknown>;

function collectPixiWarnings(raw: PixiRaw): string[] {
  const warnings: string[] = [];
  // Pixi supports spawnBurst which has no equivalent
  if (raw.spawnBurst !== undefined) {
    warnings.push('Pixi spawnBurst spawn type has no equivalent and was mapped to point emitter');
  }
  // Pixi spawnPolygon
  if (raw.spawnPolygon !== undefined) {
    warnings.push('Pixi spawnPolygon spawn type has no equivalent and was mapped to point emitter');
  }
  // Pixi acceleration (only warn when non-zero)
  const accel = raw.acceleration as { x?: unknown; y?: unknown } | undefined;
  if (accel !== undefined && (rn(accel.x, 0) !== 0 || rn(accel.y, 0) !== 0)) {
    warnings.push('Pixi acceleration is not supported and was ignored');
  }
  // extraData / behaviors
  if (raw.behaviors !== undefined) {
    warnings.push('Pixi v5+ behaviors array is partially supported; only core properties were imported');
  }
  return warnings;
}

function parsePixiJson(json: string): PixiRaw {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new Error(`Invalid Pixi particle JSON: ${(e as Error).message}`);
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(
      `Invalid Pixi particle document: expected a JSON object, got ${raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw}`,
    );
  }
  return raw as PixiRaw;
}

// The pixi-particle-emitter config shape (v5/v6):
//   { pos: {x,y}, spawnRect/{...}, frequency, maxParticles, lifetime: {min,max},
//     speed: {start,end}, scale: {start,end}, alpha: {start,end},
//     color: {start,end}, blendMode, angle: {start,end}, startRotation: {min,max},
//     noRotation, rotationSpeed, ... }
function rawToConfig(raw: PixiRaw): ParticleEmitterConfig {
  const maxParticles = rn(raw.maxParticles, 1000) | 0;
  const frequency = rn(raw.frequency, 0.1);
  const spawnRate = frequency > 0 ? 1 / frequency : 10;
  // Lifetime
  const life = raw.lifetime as { min?: unknown; max?: unknown } | undefined;
  const lifetimeMin = rn(life?.min, 0.5);
  const lifetimeMax = rn(life?.max, 1.0);
  // Speed
  const [speedStart, speedEnd] = readStartEnd(raw.speed, 100, 50);
  const speedMin = Math.min(speedStart, speedEnd);
  const speedMax = Math.max(speedStart, speedEnd);
  // Scale
  const [scaleStart, scaleEnd] = readStartEnd(raw.scale, 1, 0.5);
  const scaleMin = Math.min(scaleStart, scaleEnd);
  const scaleMax = Math.max(scaleStart, scaleEnd);
  const scaleEndRatio = scaleMax > 0 ? Math.min(scaleStart, scaleEnd) / scaleMax : 1;
  // Alpha
  const [alphaStart, alphaEnd] = readStartEnd(raw.alpha, 1, 0);
  // Color
  const colorObj = raw.color as { start?: unknown; end?: unknown } | undefined;
  const [sr, sg, sb] = readColor(colorObj?.start, 'ffffff');
  const [er, eg, eb] = readColor(colorObj?.end, 'ffffff');
  // Angle (emit direction)
  const angleObj = raw.angle as { min?: unknown; max?: unknown } | undefined;
  const angleMin = rn(angleObj?.min, 0);
  const angleMax = rn(angleObj?.max, 360);
  const angleMid = (angleMin + angleMax) * 0.5 * DEG2RAD;
  const spread = (angleMax - angleMin) * 0.5 * DEG2RAD;
  // Spawn shape: pos + optional spawnRect/spawnCircle/spawnBurst
  let emitterShape: 'point' | 'circle' | 'rect' = 'point';
  let emitterRadius = 0;
  let emitterWidth = 0;
  let emitterHeight = 0;
  const spawnRect = raw.spawnRect as { w?: unknown; h?: unknown } | undefined;
  const spawnCircle = raw.spawnCircle as { r?: unknown } | undefined;
  if (spawnCircle) {
    emitterShape = 'circle';
    emitterRadius = rn(spawnCircle.r, 0);
  } else if (spawnRect) {
    emitterShape = 'rect';
    emitterWidth = rn(spawnRect.w, 0);
    emitterHeight = rn(spawnRect.h, 0);
  }
  // Blend mode
  const blendModeStr = rs(raw.blendMode, 'normal').toLowerCase();
  let blendMode: ParticleBlendMode | null = null;
  if (blendModeStr === 'add' || blendModeStr === 'additive') blendMode = 'add';
  else if (blendModeStr === 'multiply') blendMode = 'multiply';
  else if (blendModeStr === 'screen') blendMode = 'screen';
  else if (blendModeStr === 'normal' || blendModeStr === 'src_alpha') blendMode = 'normal';
  // Rotation speed
  const rotationSpeed = rn(raw.rotationSpeed, 0) * DEG2RAD;
  return createParticleEmitterConfig({
    maxParticles,
    spawnRate,
    lifetimeMin,
    lifetimeMax,
    speedMin,
    speedMax,
    directionX: Math.cos(angleMid),
    directionY: Math.sin(angleMid),
    spread,
    emitterShape,
    emitterRadius,
    emitterWidth,
    emitterHeight,
    scaleMin,
    scaleMax,
    scaleEnd: scaleEndRatio,
    colorStartR: sr,
    colorStartG: sg,
    colorStartB: sb,
    colorEndR: er,
    colorEndG: eg,
    colorEndB: eb,
    alphaStart,
    alphaEnd,
    rotationSpeedMin: rotationSpeed,
    rotationSpeedMax: rotationSpeed,
    blendMode,
  });
}

function readColor(obj: unknown, def = 'ffffff'): [number, number, number] {
  const valueObj = obj as { value?: unknown } | null | undefined;
  const hex = typeof obj === 'string' ? obj : typeof valueObj?.value === 'string' ? valueObj.value : def;
  const s = hex.replace(/^#/, '').padEnd(6, 'f');
  const channel = (i: number) => {
    const v = parseInt(s.slice(i, i + 2), 16);
    return Number.isFinite(v) ? v / 255 : 1;
  };
  return [channel(0), channel(2), channel(4)];
}

/** Read a pixi-particle-emitter "start/end" value pair (both may be a number or a {value} object). */
function readStartEnd(obj: unknown, defStart = 1, defEnd = 0): [number, number] {
  if (obj == null || typeof obj !== 'object') return [defStart, defEnd];
  const o = obj as { start?: unknown; end?: unknown };
  const startObj = o.start as { value?: unknown } | undefined;
  const endObj = o.end as { value?: unknown } | undefined;
  const start = typeof o.start === 'number' ? o.start : typeof startObj?.value === 'number' ? startObj.value : defStart;
  const end = typeof o.end === 'number' ? o.end : typeof endObj?.value === 'number' ? endObj.value : defEnd;
  return [rn(start, defStart), rn(end, defEnd)];
}

function rn(v: unknown, def = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : def;
}

function rs(v: unknown, def = ''): string {
  return typeof v === 'string' ? v : def;
}

import type { ParticleEmitterConfig } from '@flighthq/particles';
import { createParticleEmitterConfig } from '@flighthq/particles';

import type { SpineAlphaKeyframe, SpineParticleDocument, SpineTintKeyframe } from './schema';

export interface SpineParsed {
  config: ParticleEmitterConfig;
  document: SpineParticleDocument;
}

const DEG2RAD = Math.PI / 180;

// ─── Value helpers (operate on raw JSON, no document allocation) ─────────────

function rangeMid(obj: unknown, def = 0): number {
  if (obj != null && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    const lo = typeof o.low === 'number' ? o.low : def;
    const hi = typeof o.high === 'number' ? o.high : def;
    return (lo + hi) * 0.5;
  }
  return def;
}
function rangeLow(obj: unknown, def = 0): number {
  if (obj != null && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    return typeof o.low === 'number' ? o.low : def;
  }
  return def;
}
function rangeHigh(obj: unknown, def = 0): number {
  if (obj != null && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    return typeof o.high === 'number' ? o.high : def;
  }
  return def;
}
function hexToRgb(hex: string): [number, number, number] {
  const s = hex.replace('#', '').padEnd(6, 'f');
  return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
}
function firstTintColor(arr: unknown): [number, number, number] {
  return hexToRgb(
    Array.isArray(arr) && arr.length > 0
      ? (((arr[0] as Record<string, unknown>).color as string) ?? 'ffffff')
      : 'ffffff',
  );
}
function lastTintColor(arr: unknown): [number, number, number] {
  if (!Array.isArray(arr) || arr.length === 0) return [1, 1, 1];
  return hexToRgb(((arr[arr.length - 1] as Record<string, unknown>).color as string) ?? 'ffffff');
}
function firstAlpha(arr: unknown): number {
  return Array.isArray(arr) && arr.length > 0 ? (((arr[0] as Record<string, unknown>).alpha as number) ?? 1) : 1;
}
function lastAlpha(arr: unknown): number {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  return ((arr[arr.length - 1] as Record<string, unknown>).alpha as number) ?? 0;
}

// ─── Shared raw → config mapping ─────────────────────────────────────────────

function rawToConfig(raw: Record<string, unknown>): ParticleEmitterConfig {
  const lifeLow = rangeLow(raw.life, 500) / 1000;
  const lifeHigh = rangeHigh(raw.life, 1500) / 1000;
  const angleLow = rangeLow(raw.angle, 60);
  const angleHigh = rangeHigh(raw.angle, 120);
  const angleMid = (angleLow + angleHigh) * 0.5 * DEG2RAD;
  const spread = (angleHigh - angleLow) * 0.5 * DEG2RAD;
  const spawnShape = typeof raw.spawnShape === 'string' ? raw.spawnShape : 'point';
  const sx = rangeMid(raw.spawnWidth, 0);
  const sy = rangeMid(raw.spawnHeight, 0);
  const emitterShape = spawnShape === 'ellipse' ? (sx === sy ? 'circle' : 'rect') : 'point';
  const spawnScaleMid = rangeMid(raw.scale, 1);
  const endScaleMid = rangeMid(raw.scaleEnd, 0);
  const startTint = firstTintColor(raw.tint);
  const endTint = lastTintColor(raw.tint);

  return createParticleEmitterConfig({
    maxParticles: typeof raw.maxParticles === 'number' ? raw.maxParticles | 0 : 500,
    spawnRate: rangeMid(raw.emission, 20),
    lifetimeMin: lifeLow,
    lifetimeMax: lifeHigh,
    speedMin: rangeLow(raw.velocity, 50),
    speedMax: rangeHigh(raw.velocity, 150),
    directionX: Math.cos(angleMid),
    directionY: -Math.sin(angleMid),
    spread,
    gravityX: rangeMid(raw.wind, 0),
    gravityY: rangeMid(raw.gravity, 0),
    emitterShape,
    emitterRadius: emitterShape === 'circle' ? sx * 0.5 : 0,
    emitterWidth: emitterShape === 'rect' ? sx : 0,
    emitterHeight: emitterShape === 'rect' ? sy : 0,
    scaleMin: rangeLow(raw.scale, 1),
    scaleMax: rangeHigh(raw.scale, 1),
    scaleEnd: spawnScaleMid > 0 ? endScaleMid / spawnScaleMid : 0,
    colorStartR: startTint[0],
    colorStartG: startTint[1],
    colorStartB: startTint[2],
    colorEndR: endTint[0],
    colorEndG: endTint[1],
    colorEndB: endTint[2],
    alphaStart: firstAlpha(raw.alpha),
    alphaEnd: lastAlpha(raw.alpha),
    rotationSpeedMin: rangeLow(raw.rotation, 0) * DEG2RAD,
    rotationSpeedMax: rangeHigh(raw.rotation, 0) * DEG2RAD,
  });
}

// ─── Document construction (load path only) ──────────────────────────────────

function rawToDocument(raw: Record<string, unknown>): SpineParticleDocument {
  const s = (k: string, def: string) => (typeof raw[k] === 'string' ? (raw[k] as string) : def);
  const n = (k: string, def: number) => (typeof raw[k] === 'number' ? (raw[k] as number) : def);
  const b = (k: string, def: boolean) => (typeof raw[k] === 'boolean' ? (raw[k] as boolean) : def);
  const rv = (obj: unknown, lo = 0, hi = 0) => ({
    low:
      obj != null && typeof obj === 'object' && typeof (obj as Record<string, unknown>).low === 'number'
        ? ((obj as Record<string, unknown>).low as number)
        : lo,
    high:
      obj != null && typeof obj === 'object' && typeof (obj as Record<string, unknown>).high === 'number'
        ? ((obj as Record<string, unknown>).high as number)
        : hi,
  });
  const tintKfs = (arr: unknown): SpineTintKeyframe[] =>
    Array.isArray(arr)
      ? arr.map((k) => ({
          time:
            typeof (k as Record<string, unknown>).time === 'number'
              ? ((k as Record<string, unknown>).time as number)
              : 0,
          color:
            typeof (k as Record<string, unknown>).color === 'string'
              ? ((k as Record<string, unknown>).color as string)
              : 'ffffff',
        }))
      : [{ time: 0, color: 'ffffff' }];
  const alphaKfs = (arr: unknown): SpineAlphaKeyframe[] =>
    Array.isArray(arr)
      ? arr.map((k) => ({
          time:
            typeof (k as Record<string, unknown>).time === 'number'
              ? ((k as Record<string, unknown>).time as number)
              : 0,
          alpha:
            typeof (k as Record<string, unknown>).alpha === 'number'
              ? ((k as Record<string, unknown>).alpha as number)
              : 1,
        }))
      : [
          { time: 0, alpha: 1 },
          { time: 1, alpha: 0 },
        ];

  return {
    name: s('name', ''),
    maxParticles: n('maxParticles', 500) | 0,
    continuous: b('continuous', true),
    duration: n('duration', -1),
    emission: rv(raw.emission, 10, 30),
    life: rv(raw.life, 500, 1500),
    lifeOffset: rv(raw.lifeOffset, 0, 0),
    x: rv(raw.x, 0, 0),
    y: rv(raw.y, 0, 0),
    spawnShape: s('spawnShape', 'point') as SpineParticleDocument['spawnShape'],
    spawnWidth: rv(raw.spawnWidth, 0, 0),
    spawnHeight: rv(raw.spawnHeight, 0, 0),
    velocity: rv(raw.velocity, 50, 150),
    angle: rv(raw.angle, 60, 120),
    rotation: rv(raw.rotation, 0, 0),
    wind: rv(raw.wind, 0, 0),
    gravity: rv(raw.gravity, 0, 0),
    scale: rv(raw.scale, 1, 1),
    scaleEnd: rv(raw.scaleEnd, 0, 0),
    tint: tintKfs(raw.tint),
    alpha: alphaKfs(raw.alpha),
    blendMode: s('blendMode', 'normal') as SpineParticleDocument['blendMode'],
    premultiplied: b('premultiplied', false),
    images: Array.isArray(raw.images) ? (raw.images as string[]) : [],
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Parse a Spine particle effect JSON string and preserve the full document for
 *  round-trip serialisation via `serializeSpineParticle`. */
export function loadSpineParticle(json: string): SpineParsed {
  const raw = JSON.parse(json) as Record<string, unknown>;
  return { config: rawToConfig(raw), document: rawToDocument(raw) };
}

/** Parse a Spine particle effect JSON string directly to a ParticleEmitterConfig.
 *
 *  Single-pass: no intermediate document object is allocated.
 *  Use `loadSpineParticle` instead when you need round-trip serialisation. */
export function parseSpineParticle(json: string): ParticleEmitterConfig {
  return rawToConfig(JSON.parse(json) as Record<string, unknown>);
}

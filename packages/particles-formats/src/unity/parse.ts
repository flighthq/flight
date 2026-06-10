import type { ParticleEmitterConfig } from '@flighthq/particles';
import { createParticleEmitterConfig } from '@flighthq/particles';

import type {
  UnityColor,
  UnityColorOverLifetime,
  UnityEmission,
  UnityMinMaxValue,
  UnityParticleDocument,
  UnityRotationOverLifetime,
  UnityShape,
  UnitySizeOverLifetime,
} from './schema';

export interface UnityParseOptions {
  /** Pixels-per-unit for the target canvas. Unity uses world-space units (metres);
   *  multiply by this factor to convert to pixel coordinates.  Defaults to 100. */
  pixelsPerUnit?: number;
}

export interface UnityParsed {
  config: ParticleEmitterConfig;
  document: UnityParticleDocument;
}

const DEG2RAD = Math.PI / 180;
const DEFAULT_PPU = 100;
const DEFAULT_GRAVITY = 9.81;

// ─── Value helpers (shared by both paths) ────────────────────────────────────

function rn(obj: unknown, def = 0): number {
  return typeof obj === 'number' ? obj : def;
}
function rb(obj: unknown, def: boolean): boolean {
  return typeof obj === 'boolean' ? obj : def;
}
function rs(obj: unknown, def: string): string {
  return typeof obj === 'string' ? obj : def;
}

function mmLow(obj: unknown, def = 0): number {
  if (obj == null) return def;
  if (typeof obj === 'number') return obj;
  const o = obj as Record<string, unknown>;
  const mode = rs(o.mode, 'constant');
  if (mode === 'twoConstants' || mode === 'twoCurves') return rn(o.constantMin, rn(o.constant, def));
  return rn(o.constant, def);
}
function mmHigh(obj: unknown, def = 0): number {
  if (obj == null) return def;
  if (typeof obj === 'number') return obj;
  const o = obj as Record<string, unknown>;
  const mode = rs(o.mode, 'constant');
  if (mode === 'twoConstants' || mode === 'twoCurves') return rn(o.constantMax, rn(o.constant, def));
  return rn(o.constant, def);
}

function colorAt(obj: unknown, def: UnityColor): UnityColor {
  if (obj != null && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    return { r: rn(o.r, def.r), g: rn(o.g, def.g), b: rn(o.b, def.b), a: rn(o.a, def.a) };
  }
  return { ...def };
}

// ─── Shared raw → config mapping ─────────────────────────────────────────────

function rawToConfig(raw: Record<string, unknown>, ppu: number): ParticleEmitterConfig {
  const physicsGravity = rn(raw.physicsGravity, DEFAULT_GRAVITY);
  const gravPixels = rn(raw.gravityModifier, 0) * physicsGravity * ppu;

  const emRaw = raw.emission as Record<string, unknown> | undefined;
  const spawnRate = (mmLow(emRaw?.rateOverTime, 10) + mmHigh(emRaw?.rateOverTime, 10)) * 0.5;
  const burstsRaw = Array.isArray(emRaw?.bursts) ? (emRaw!.bursts as Record<string, unknown>[]) : [];
  const burst0 = burstsRaw[0];
  const burstCount = burst0 ? rn(burst0.count, 0) : 0;
  const burstInterval = burst0 && rn(burst0.cycleCount, 1) !== 1 ? rn(burst0.repeatInterval, 0) : 0;

  const shapeRaw = raw.shape as Record<string, unknown> | undefined;
  const shapeEnabled = rb(shapeRaw?.enabled, false);
  const shapeType = rs(shapeRaw?.shapeType, 'Cone');
  let emitterShape: 'point' | 'circle' | 'rect' = 'point';
  let emitterRadius = 0,
    emitterWidth = 0,
    emitterHeight = 0;
  let directionX = 0,
    directionY = -1,
    spread = Math.PI;

  if (shapeEnabled) {
    const shapeRadius = rn(shapeRaw?.radius, 0) * ppu;
    const scaleRaw = shapeRaw?.scale as Record<string, unknown> | undefined;
    if (shapeType === 'Sphere' || shapeType === 'Hemisphere' || shapeType === 'Circle') {
      emitterShape = 'circle';
      emitterRadius = shapeRadius;
      spread = Math.PI * 2;
    } else if (shapeType === 'Box' || shapeType === 'Rectangle') {
      emitterShape = 'rect';
      emitterWidth = rn(scaleRaw?.x, 1) * ppu;
      emitterHeight = rn(scaleRaw?.y, 1) * ppu;
      spread = Math.PI * 2;
    } else if (shapeType === 'Cone') {
      spread = rn(shapeRaw?.angle, 25) * DEG2RAD;
      emitterShape = shapeRadius > 0 ? 'circle' : 'point';
      emitterRadius = shapeRadius;
    }
  }

  const scaleLow = mmLow(raw.startSize, 1);
  const scaleHigh = mmHigh(raw.startSize, 1);
  const solRaw = raw.sizeOverLifetime as Record<string, unknown> | undefined;
  const solEnabled = rb(solRaw?.enabled, false);
  const scaleEnd = solEnabled ? rn(solRaw?.sizeEnd, 1) / Math.max(0.001, (scaleLow + scaleHigh) * 0.5) : 1;

  const colRaw = raw.colorOverLifetime as Record<string, unknown> | undefined;
  const colEnabled = rb(colRaw?.enabled, false);
  const WHITE: UnityColor = { r: 1, g: 1, b: 1, a: 1 };
  const FADE: UnityColor = { r: 1, g: 1, b: 1, a: 0 };
  const startColor = colEnabled ? colorAt(colRaw?.colorStart, WHITE) : colorAt(raw.startColor, WHITE);
  const endColor = colEnabled ? colorAt(colRaw?.colorEnd, FADE) : colorAt(raw.startColor, WHITE);

  const rolRaw = raw.rotationOverLifetime as Record<string, unknown> | undefined;
  const rolEnabled = rb(rolRaw?.enabled, false);
  const rotLow = rolEnabled ? mmLow(rolRaw?.angularVelocity, 0) * DEG2RAD : 0;
  const rotHigh = rolEnabled ? mmHigh(rolRaw?.angularVelocity, 0) * DEG2RAD : 0;

  return createParticleEmitterConfig({
    maxParticles: rn(raw.maxParticles, 1000) | 0,
    spawnRate,
    lifetimeMin: mmLow(raw.startLifetime, 1),
    lifetimeMax: mmHigh(raw.startLifetime, 1),
    speedMin: mmLow(raw.startSpeed, 5) * ppu,
    speedMax: mmHigh(raw.startSpeed, 5) * ppu,
    directionX,
    directionY,
    spread,
    gravityX: 0,
    gravityY: gravPixels,
    emitterShape,
    emitterRadius,
    emitterWidth,
    emitterHeight,
    scaleMin: scaleLow,
    scaleMax: scaleHigh,
    scaleEnd,
    colorStartR: startColor.r,
    colorStartG: startColor.g,
    colorStartB: startColor.b,
    colorEndR: endColor.r,
    colorEndG: endColor.g,
    colorEndB: endColor.b,
    alphaStart: startColor.a,
    alphaEnd: endColor.a,
    rotationSpeedMin: rotLow,
    rotationSpeedMax: rotHigh,
    burstCount,
    burstInterval,
  });
}

// ─── Document construction (load path only) ──────────────────────────────────

function readMinMax(obj: unknown, defConst = 1): UnityMinMaxValue {
  if (obj == null) return { mode: 'constant', constant: defConst };
  if (typeof obj === 'number') return { mode: 'constant', constant: obj };
  const o = obj as Record<string, unknown>;
  return {
    mode: rs(o.mode, 'constant') as UnityMinMaxValue['mode'],
    constant: rn(o.constant, defConst),
    constantMin: rn(o.constantMin, defConst),
    constantMax: rn(o.constantMax, defConst),
  };
}
function readEmission(obj: unknown): UnityEmission {
  if (obj == null || typeof obj !== 'object') return { rateOverTime: { mode: 'constant', constant: 10 }, bursts: [] };
  const o = obj as Record<string, unknown>;
  const bursts = Array.isArray(o.bursts)
    ? (o.bursts as Record<string, unknown>[]).map((b) => ({
        time: rn(b.time, 0),
        count: rn(b.count, 0),
        cycleCount: rn(b.cycleCount, 1),
        repeatInterval: rn(b.repeatInterval, 0),
      }))
    : [];
  return { rateOverTime: readMinMax(o.rateOverTime, 10), bursts };
}
function readShape(obj: unknown): UnityShape {
  const def: UnityShape = { enabled: true, shapeType: 'Cone', radius: 1, angle: 25, scale: { x: 1, y: 1, z: 1 } };
  if (obj == null || typeof obj !== 'object') return def;
  const o = obj as Record<string, unknown>;
  const sc = o.scale && typeof o.scale === 'object' ? (o.scale as Record<string, unknown>) : {};
  return {
    enabled: rb(o.enabled, true),
    shapeType: rs(o.shapeType, 'Cone') as UnityShape['shapeType'],
    radius: rn(o.radius, 1),
    angle: rn(o.angle, 25),
    scale: { x: rn(sc.x, 1), y: rn(sc.y, 1), z: rn(sc.z, 1) },
  };
}
function readColorLifetime(obj: unknown): UnityColorOverLifetime {
  const def: UnityColorOverLifetime = {
    enabled: false,
    colorStart: { r: 1, g: 1, b: 1, a: 1 },
    colorEnd: { r: 1, g: 1, b: 1, a: 0 },
  };
  if (obj == null || typeof obj !== 'object') return def;
  const o = obj as Record<string, unknown>;
  return {
    enabled: rb(o.enabled, false),
    colorStart: colorAt(o.colorStart, def.colorStart),
    colorEnd: colorAt(o.colorEnd, def.colorEnd),
  };
}
function readSizeLifetime(obj: unknown): UnitySizeOverLifetime {
  if (obj == null || typeof obj !== 'object') return { enabled: false, sizeStart: 1, sizeEnd: 1 };
  const o = obj as Record<string, unknown>;
  return { enabled: rb(o.enabled, false), sizeStart: rn(o.sizeStart, 1), sizeEnd: rn(o.sizeEnd, 1) };
}
function readRotationLifetime(obj: unknown): UnityRotationOverLifetime {
  if (obj == null || typeof obj !== 'object')
    return { enabled: false, angularVelocity: { mode: 'constant', constant: 0 } };
  const o = obj as Record<string, unknown>;
  return { enabled: rb(o.enabled, false), angularVelocity: readMinMax(o.angularVelocity, 0) };
}

function rawToDocument(raw: Record<string, unknown>): UnityParticleDocument {
  return {
    name: rs(raw.name, ''),
    duration: rn(raw.duration, 5),
    looping: rb(raw.looping, true),
    prewarm: rb(raw.prewarm, false),
    maxParticles: rn(raw.maxParticles, 1000) | 0,
    startLifetime: readMinMax(raw.startLifetime, 1),
    startSpeed: readMinMax(raw.startSpeed, 5),
    startSize: readMinMax(raw.startSize, 1),
    startRotation: readMinMax(raw.startRotation, 0),
    startColor: colorAt(raw.startColor, { r: 1, g: 1, b: 1, a: 1 }),
    gravityModifier: rn(raw.gravityModifier, 0),
    physicsGravity: rn(raw.physicsGravity, DEFAULT_GRAVITY),
    emission: readEmission(raw.emission),
    shape: readShape(raw.shape),
    colorOverLifetime: readColorLifetime(raw.colorOverLifetime),
    sizeOverLifetime: readSizeLifetime(raw.sizeOverLifetime),
    rotationOverLifetime: readRotationLifetime(raw.rotationOverLifetime),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Parse a Unity Shuriken particle system JSON string and preserve the full document
 *  for round-trip serialisation via `serializeUnityParticle`. */
export function loadUnityParticle(json: string, options?: UnityParseOptions): UnityParsed {
  const ppu = options?.pixelsPerUnit ?? DEFAULT_PPU;
  const raw = JSON.parse(json) as Record<string, unknown>;
  return { config: rawToConfig(raw, ppu), document: rawToDocument(raw) };
}

/** Parse a Unity Shuriken particle system JSON string directly to a ParticleEmitterConfig.
 *
 *  Single-pass: no intermediate document object is allocated.
 *  Use `loadUnityParticle` instead when you need round-trip serialisation. */
export function parseUnityParticle(json: string, options?: UnityParseOptions): ParticleEmitterConfig {
  return rawToConfig(JSON.parse(json) as Record<string, unknown>, options?.pixelsPerUnit ?? DEFAULT_PPU);
}

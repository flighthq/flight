import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { DEG_TO_RAD } from '@flighthq/math/contract';
import {
  createParticleEmitterConfig,
  particleColorCurveFromKeyframes,
  particleCurveFromKeyframes,
} from '@flighthq/particles/contract';
import type {
  ImportDiagnostic,
  SpineParsed,
  ColorKeyframe,
  CurveKeyframe,
  ParticleBlendMode,
  ParticleCurve,
  ParticleEmitterConfig,
  SpineAlphaKeyframe,
  SpineParticleDocument,
  SpineTintKeyframe,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

// ─── Value helpers (operate on raw JSON, no document allocation) ─────────────

/** Parse a JSON string and assert the root is a plain object, throwing a clear,
 *  format-tagged error otherwise. Particle assets are frequently hand-edited or
 *  produced by external tools, so a corrupt or empty file must fail with an
 *  actionable message rather than a cryptic `Cannot read properties of null`. */
function parseSpineJson(json: string): Record<string, unknown> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid Spine particle JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isUnknownRecord(raw)) {
    throw new Error(
      `Invalid Spine particle document: expected a JSON object, got ${raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw}`,
    );
  }
  validateSpineNestedEntries(raw);
  return raw;
}

function rangeMid(obj: unknown, def = 0): number {
  if (isUnknownRecord(obj)) {
    const lo = typeof obj.low === 'number' ? obj.low : def;
    const hi = typeof obj.high === 'number' ? obj.high : def;
    return (lo + hi) * 0.5;
  }
  return def;
}
function rangeLow(obj: unknown, def = 0): number {
  if (isUnknownRecord(obj)) return typeof obj.low === 'number' ? obj.low : def;
  return def;
}
function rangeHigh(obj: unknown, def = 0): number {
  if (isUnknownRecord(obj)) return typeof obj.high === 'number' ? obj.high : def;
  return def;
}
function hexToRgb(hex: string): [number, number, number] {
  const s = hex.replace('#', '').padEnd(6, 'f');
  // Fall back to a full channel (1) for any non-hex pair so a malformed color
  // string never injects NaN into the config (which would poison the simulation).
  const channel = (i: number): number => {
    const v = parseInt(s.slice(i, i + 2), 16);
    return Number.isFinite(v) ? v / 255 : 1;
  };
  return [channel(0), channel(2), channel(4)];
}
function firstTintColor(arr: unknown): [number, number, number] {
  if (!Array.isArray(arr) || arr.length === 0) return [1, 1, 1];
  const keyframe = requireSpineRecord(arr[0], 'tint[0]');
  return hexToRgb(typeof keyframe.color === 'string' ? keyframe.color : 'ffffff');
}
function lastTintColor(arr: unknown): [number, number, number] {
  if (!Array.isArray(arr) || arr.length === 0) return [1, 1, 1];
  const keyframe = requireSpineRecord(arr[arr.length - 1], `tint[${arr.length - 1}]`);
  return hexToRgb(typeof keyframe.color === 'string' ? keyframe.color : 'ffffff');
}
function firstAlpha(arr: unknown): number {
  if (!Array.isArray(arr) || arr.length === 0) return 1;
  const keyframe = requireSpineRecord(arr[0], 'alpha[0]');
  return typeof keyframe.alpha === 'number' ? keyframe.alpha : 1;
}
function lastAlpha(arr: unknown): number {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  const keyframe = requireSpineRecord(arr[arr.length - 1], `alpha[${arr.length - 1}]`);
  return typeof keyframe.alpha === 'number' ? keyframe.alpha : 0;
}

function invalidSpineEntry(path: string, expected: string): never {
  throw new Error(`Invalid Spine particle document: ${path} must be ${expected}`);
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireSpineRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isUnknownRecord(value)) invalidSpineEntry(path, 'a JSON object');
  return value;
}

function readSpineImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const images: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const image = value[i];
    if (typeof image !== 'string') invalidSpineEntry(`images[${i}]`, 'a string');
    images.push(image);
  }
  return images;
}

function validateSpineNestedEntries(raw: Readonly<Record<string, unknown>>): void {
  validateSpineRecordEntries(raw.tint, 'tint');
  validateSpineRecordEntries(raw.alpha, 'alpha');
  readSpineImages(raw.images);
}

function validateSpineRecordEntries(value: unknown, path: string): void {
  if (!Array.isArray(value)) return;
  for (let i = 0; i < value.length; i++) requireSpineRecord(value[i], `${path}[${i}]`);
}

// ─── Shared raw → config mapping ─────────────────────────────────────────────

function rawToConfig(raw: Record<string, unknown>): ParticleEmitterConfig {
  const lifeLow = rangeLow(raw.life, 500) / 1000;
  const lifeHigh = rangeHigh(raw.life, 1500) / 1000;
  const angleLow = rangeLow(raw.angle, 60);
  const angleHigh = rangeHigh(raw.angle, 120);
  const angleMid = (angleLow + angleHigh) * 0.5 * DEG_TO_RAD;
  const spread = (angleHigh - angleLow) * 0.5 * DEG_TO_RAD;
  const spawnShape = typeof raw.spawnShape === 'string' ? raw.spawnShape : 'point';
  const sx = rangeMid(raw.spawnWidth, 0);
  const sy = rangeMid(raw.spawnHeight, 0);
  const emitterShape = spawnShape === 'ellipse' ? (sx === sy ? 'circle' : 'rect') : 'point';
  const spawnScaleMid = rangeMid(raw.scale, 1);
  const endScaleMid = rangeMid(raw.scaleEnd, 0);
  const startTint = firstTintColor(raw.tint);
  const endTint = lastTintColor(raw.tint);
  // Multi-stop tint/alpha timelines bake into lifetime curves (preserves the full
  // shape); 2-stop timelines fall back to the linear start→end path.
  const colorCurve = tintKeyframesToCurve(raw.tint);
  const alphaCurve = alphaKeyframesToCurve(raw.alpha);
  // A continuous Spine emitter emits forever; otherwise `duration` (ms) bounds it.
  const continuous = typeof raw.continuous === 'boolean' ? raw.continuous : true;
  const durationMs = typeof raw.duration === 'number' ? raw.duration : -1;

  return createParticleEmitterConfig({
    maxParticles: typeof raw.maxParticles === 'number' ? raw.maxParticles | 0 : 500,
    spawnRate: rangeMid(raw.emission, 20),
    loop: continuous,
    duration: !continuous && durationMs > 0 ? durationMs / 1000 : 0,
    colorCurve,
    alphaCurve,
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
    rotationSpeedMin: rangeLow(raw.rotation, 0) * DEG_TO_RAD,
    rotationSpeedMax: rangeHigh(raw.rotation, 0) * DEG_TO_RAD,
    blendMode: spineBlendMode(typeof raw.blendMode === 'string' ? raw.blendMode : 'normal'),
  });
}

// Single-field checks (not a hot loop) → direct reports; collectSpineDiagnostics is the physical emitter and
// hence the origin. Skip = a recognized Spine field Flight does not model. (Multi-stop tint/alpha timelines
// are baked into lifetime curves, so they no longer report.)
function collectSpineDiagnostics(raw: Record<string, unknown>): ImportDiagnostic[] {
  const diagnostics: ImportDiagnostic[] = [];
  const nonZeroRange = (key: string): boolean => {
    const range = raw[key];
    if (!isUnknownRecord(range)) return false;
    return (typeof range.low === 'number' && range.low !== 0) || (typeof range.high === 'number' && range.high !== 0);
  };
  if (nonZeroRange('lifeOffset')) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'spine.life-offset-unsupported',
      'collectSpineDiagnostics',
    );
  }
  if (nonZeroRange('x') || nonZeroRange('y')) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'spine.position-range-unsupported',
      'collectSpineDiagnostics',
    );
  }
  if (raw.premultiplied === true) {
    // The premultiplied-alpha flag is read but not acted on (blending behavior may differ) — matches the
    // libgdx.premultiplied-alpha-informational crumb, so the two parsers agree.
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'spine.premultiplied-informational',
      'collectSpineDiagnostics',
    );
  }
  return diagnostics;
}

// Build a color curve from a tint timeline, but only when it has more than two
// stops (a 2-stop timeline is exactly the linear start→end path, so we skip it).
function tintKeyframesToCurve(arr: unknown): ParticleCurve | null {
  if (!Array.isArray(arr) || arr.length <= 2) return null;
  const keys: ColorKeyframe[] = [];
  for (let i = 0; i < arr.length; i++) {
    const keyframe = requireSpineRecord(arr[i], `tint[${i}]`);
    const [r, g, b] = hexToRgb(typeof keyframe.color === 'string' ? keyframe.color : 'ffffff');
    keys.push({ time: typeof keyframe.time === 'number' ? keyframe.time : i / (arr.length - 1), r, g, b });
  }
  return particleColorCurveFromKeyframes(keys);
}

function alphaKeyframesToCurve(arr: unknown): ParticleCurve | null {
  if (!Array.isArray(arr) || arr.length <= 2) return null;
  const keys: CurveKeyframe[] = [];
  for (let i = 0; i < arr.length; i++) {
    const keyframe = requireSpineRecord(arr[i], `alpha[${i}]`);
    keys.push({
      time: typeof keyframe.time === 'number' ? keyframe.time : i / (arr.length - 1),
      value: typeof keyframe.alpha === 'number' ? keyframe.alpha : 1,
    });
  }
  return particleCurveFromKeyframes(keys);
}

function spineBlendMode(mode: string): ParticleBlendMode | null {
  if (mode === 'additive') return 'add';
  if (mode === 'multiply') return 'multiply';
  if (mode === 'screen') return 'screen';
  if (mode === 'normal') return 'normal';
  return null;
}

function spineDocumentBlendMode(value: unknown): SpineParticleDocument['blendMode'] {
  if (value === 'additive' || value === 'multiply' || value === 'screen') return value;
  return 'normal';
}

function spineSpawnShape(value: unknown): SpineParticleDocument['spawnShape'] {
  if (value === 'ellipse' || value === 'line') return value;
  return 'point';
}

// ─── Document construction (load path only) ──────────────────────────────────

function rawToDocument(raw: Record<string, unknown>): SpineParticleDocument {
  const s = (key: string, fallback: string): string => {
    const value = raw[key];
    return typeof value === 'string' ? value : fallback;
  };
  const n = (key: string, fallback: number): number => {
    const value = raw[key];
    return typeof value === 'number' ? value : fallback;
  };
  const b = (key: string, fallback: boolean): boolean => {
    const value = raw[key];
    return typeof value === 'boolean' ? value : fallback;
  };
  const rv = (obj: unknown, low = 0, high = 0) => ({
    high: rangeHigh(obj, high),
    low: rangeLow(obj, low),
  });
  const tintKfs = (arr: unknown): SpineTintKeyframe[] =>
    Array.isArray(arr)
      ? arr.map((value, index) => {
          const keyframe = requireSpineRecord(value, `tint[${index}]`);
          return {
            color: typeof keyframe.color === 'string' ? keyframe.color : 'ffffff',
            time: typeof keyframe.time === 'number' ? keyframe.time : 0,
          };
        })
      : [{ time: 0, color: 'ffffff' }];
  const alphaKfs = (arr: unknown): SpineAlphaKeyframe[] =>
    Array.isArray(arr)
      ? arr.map((value, index) => {
          const keyframe = requireSpineRecord(value, `alpha[${index}]`);
          return {
            alpha: typeof keyframe.alpha === 'number' ? keyframe.alpha : 1,
            time: typeof keyframe.time === 'number' ? keyframe.time : 0,
          };
        })
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
    spawnShape: spineSpawnShape(raw.spawnShape),
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
    blendMode: spineDocumentBlendMode(raw.blendMode),
    premultiplied: b('premultiplied', false),
    images: readSpineImages(raw.images),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Parse a Spine particle effect JSON string directly to a ParticleEmitterConfig.
 *
 *  Single-pass: no intermediate document object is allocated.
 *  Use `parseSpineParticleDocument` instead when you need round-trip serialisation. */
export function parseSpineParticle(json: string): ParticleEmitterConfig {
  return rawToConfig(parseSpineJson(json));
}

/** Parse a Spine particle effect JSON string and preserve the full document for
 *  round-trip serialisation via `serializeSpineParticle`. */
export function parseSpineParticleDocument(json: string): SpineParsed {
  const raw = parseSpineJson(json);
  return { config: rawToConfig(raw), diagnostics: collectSpineDiagnostics(raw), document: rawToDocument(raw) };
}

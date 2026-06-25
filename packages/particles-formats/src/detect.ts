import type { ParticleFormatKind } from '@flighthq/types';
import {
  LibgdxParticleFormatKind,
  ParticleDesignerFormatKind,
  PixiParticleFormatKind,
  SpineParticleFormatKind,
  StarlingPexFormatKind,
  UnityParticleFormatKind,
} from '@flighthq/types';

/** Sniff the text content of a particle file and return the format kind, or `null`
 *  when no supported format is recognisable.
 *
 *  Detection is structural, not extension-based:
 *  - libGDX `.p`: first non-empty line is `Particle Effect` (exact text).
 *  - Starling PEX: XML containing `<particleEmitterConfig`.
 *  - Particle Designer plist: XML containing `<plist`.
 *  - Unity Shuriken JSON: root object contains `looping` or `startLifetime` with a
 *    `mode` field (Unity's MinMaxCurve convention), or a `gravityModifier` key.
 *  - Pixi particle JSON: root object contains `alpha` with a `start`/`end` sub-object
 *    (pixi-particle-emitter shape) and a `pos` field.
 *  - Spine JSON: root object contains `continuous` or `emission` with `{low,high}` range shape
 *    (Spine's range-object convention) without Unity-specific keys.
 *
 *  Returns `null` for unknown or corrupt input — never throws. */
export function detectParticleFormat(text: string): ParticleFormatKind | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trimStart();
  // libGDX `.p` — first non-empty line is exactly "Particle Effect"
  const firstLine = trimmed.split('\n')[0]?.trim();
  if (firstLine === 'Particle Effect') return LibgdxParticleFormatKind;
  // XML path — Starling PEX or Particle Designer plist
  if (trimmed.startsWith('<') || trimmed.startsWith('<?xml')) {
    if (trimmed.includes('<particleEmitterConfig')) return StarlingPexFormatKind;
    if (trimmed.includes('<plist')) return ParticleDesignerFormatKind;
    return null;
  }
  // JSON path — disambiguate Spine vs Unity vs Pixi
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  // Unity: MinMaxCurve mode field, or gravityModifier, or looping + startLifetime
  if (
    hasMinMaxCurveMode(obj.startLifetime) ||
    hasMinMaxCurveMode(obj.startSpeed) ||
    hasMinMaxCurveMode(obj.startSize) ||
    typeof obj.gravityModifier === 'number' ||
    (typeof obj.looping === 'boolean' && obj.startLifetime !== undefined)
  ) {
    return UnityParticleFormatKind;
  }
  // Pixi: has 'pos' + alpha.start/end or frequency field
  if (
    obj.pos !== undefined &&
    obj.alpha !== undefined &&
    typeof obj.alpha === 'object' &&
    obj.alpha !== null &&
    ('start' in obj.alpha || 'end' in obj.alpha)
  ) {
    return PixiParticleFormatKind;
  }
  // Spine: has 'continuous' boolean or emission as {low, high} range object
  if (typeof obj.continuous === 'boolean' || isRangeObject(obj.emission) || isRangeObject(obj.life)) {
    return SpineParticleFormatKind;
  }
  return null;
}

function hasMinMaxCurveMode(val: unknown): boolean {
  return val !== null && typeof val === 'object' && typeof (val as { mode?: unknown }).mode === 'string';
}

function isRangeObject(val: unknown): boolean {
  if (val === null || typeof val !== 'object') return false;
  const o = val as { low?: unknown; high?: unknown };
  return typeof o.low === 'number' && typeof o.high === 'number';
}

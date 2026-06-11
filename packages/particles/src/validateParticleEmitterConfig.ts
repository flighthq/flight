import type { ParticleEmitterConfig } from './particleEmitterConfig';
import { createParticleEmitterConfig } from './particleEmitterConfig';

export interface ParticleConfigIssue {
  /** The config field the issue concerns. */
  field: keyof ParticleEmitterConfig;
  /** Human-readable description, suitable for an asset-pipeline / editor warning. */
  message: string;
  /** `error` = would break or corrupt the simulation (non-finite, hang).
   *  `warning` = simulates, but the result is probably not what the author intended. */
  severity: 'error' | 'warning';
}

// Every numeric field of ParticleEmitterConfig. Kept as a typed tuple so the
// validate/sanitize passes can iterate without missing a field as the config grows.
const NUMERIC_FIELDS = [
  'alphaEnd',
  'alphaStart',
  'burstCount',
  'burstInterval',
  'duration',
  'colorEndB',
  'colorEndG',
  'colorEndR',
  'colorEndVarianceB',
  'colorEndVarianceG',
  'colorEndVarianceR',
  'colorStartB',
  'colorStartG',
  'colorStartR',
  'colorStartVarianceB',
  'colorStartVarianceG',
  'colorStartVarianceR',
  'directionX',
  'directionY',
  'emitterHeight',
  'emitterRadius',
  'emitterWidth',
  'frameCount',
  'frameRate',
  'gravityX',
  'gravityY',
  'lifetimeMax',
  'lifetimeMin',
  'maxParticles',
  'regionIdMax',
  'regionIdMin',
  'rotationSpeedMax',
  'rotationSpeedMin',
  'scaleEnd',
  'scaleMax',
  'scaleMin',
  'speedMax',
  'speedMin',
  'spawnRate',
  'spread',
  'velocityInheritance',
] as const satisfies readonly (keyof ParticleEmitterConfig)[];

// Fields that must never be negative — a negative value is either meaningless
// (a count, a rate, a duration) or actively breaks the simulation.
const NON_NEGATIVE_FIELDS = [
  'burstCount',
  'burstInterval',
  'duration',
  'emitterHeight',
  'emitterRadius',
  'emitterWidth',
  'frameRate',
  'lifetimeMin',
  'lifetimeMax',
  'maxParticles',
  'scaleMax',
  'scaleMin',
  'speedMax',
  'speedMin',
  'spawnRate',
] as const satisfies readonly (keyof ParticleEmitterConfig)[];

/** Return a copy of the config with every value coerced to something the
 *  simulation can run safely: non-finite numbers fall back to their defaults,
 *  negative counts/rates/sizes are clamped to 0, integer fields are floored, and
 *  `frameCount` is forced to >= 1. Range inversions (e.g. lifetimeMin > max) are
 *  left intact since they simulate correctly — use {@link validateParticleEmitterConfig}
 *  to surface those to the author. Safe to call on partial input. */
export function sanitizeParticleEmitterConfig(config?: Partial<ParticleEmitterConfig>): ParticleEmitterConfig {
  const out = createParticleEmitterConfig(config);
  const defaults = createParticleEmitterConfig();

  // Replace any non-finite numeric field with its canonical default.
  const mutable = out as unknown as Record<string, number>;
  const defaultsRec = defaults as unknown as Record<string, number>;
  for (const field of NUMERIC_FIELDS) {
    if (!Number.isFinite(mutable[field])) mutable[field] = defaultsRec[field];
  }

  return {
    ...out,
    // Drop any curve that is empty or contains a non-finite sample so it can never
    // inject NaN — the simulation falls back to its linear interpolation path.
    alphaCurve: isFiniteCurve(out.alphaCurve) ? out.alphaCurve : null,
    colorCurve: isFiniteCurve(out.colorCurve) ? out.colorCurve : null,
    scaleCurve: isFiniteCurve(out.scaleCurve) ? out.scaleCurve : null,
    maxParticles: Math.max(0, Math.floor(out.maxParticles)),
    burstCount: Math.max(0, Math.floor(out.burstCount)),
    burstInterval: Math.max(0, out.burstInterval),
    duration: Math.max(0, out.duration),
    frameCount: Math.max(1, Math.floor(out.frameCount)),
    frameRate: Math.max(0, out.frameRate),
    regionIdMin: Math.max(0, Math.floor(out.regionIdMin)),
    regionIdMax: Math.max(Math.max(0, Math.floor(out.regionIdMin)), Math.floor(out.regionIdMax)),
    spawnRate: Math.max(0, out.spawnRate),
    lifetimeMin: Math.max(0, out.lifetimeMin),
    lifetimeMax: Math.max(0, out.lifetimeMax),
    speedMin: Math.max(0, out.speedMin),
    speedMax: Math.max(0, out.speedMax),
    scaleMin: Math.max(0, out.scaleMin),
    scaleMax: Math.max(0, out.scaleMax),
    emitterRadius: Math.max(0, out.emitterRadius),
    emitterWidth: Math.max(0, out.emitterWidth),
    emitterHeight: Math.max(0, out.emitterHeight),
  };
}

/** Report problems in a particle config without modifying it — for asset-import
 *  validation, editor inspectors, or CI checks on authored effects. Returns an
 *  empty array for a clean config. Use {@link sanitizeParticleEmitterConfig} to
 *  get a corrected config for safe runtime use. */
export function validateParticleEmitterConfig(config: Readonly<ParticleEmitterConfig>): ParticleConfigIssue[] {
  const issues: ParticleConfigIssue[] = [];

  for (const field of NUMERIC_FIELDS) {
    const value = config[field];
    if (!Number.isFinite(value)) {
      issues.push({ field, message: `${field} must be a finite number (got ${String(value)})`, severity: 'error' });
    }
  }

  for (const field of NON_NEGATIVE_FIELDS) {
    const value = config[field];
    if (Number.isFinite(value) && value < 0) {
      issues.push({ field, message: `${field} must not be negative (got ${value})`, severity: 'warning' });
    }
  }

  // A non-positive maximum lifetime means particles die the frame they spawn.
  if (Number.isFinite(config.lifetimeMax) && config.lifetimeMax <= 0) {
    issues.push({
      field: 'lifetimeMax',
      message: 'lifetimeMax must be > 0 or particles die instantly',
      severity: 'warning',
    });
  }
  // A non-positive cap means the emitter can never hold a particle.
  if (Number.isFinite(config.maxParticles) && config.maxParticles <= 0) {
    issues.push({
      field: 'maxParticles',
      message: 'maxParticles must be >= 1 or nothing ever spawns',
      severity: 'warning',
    });
  }
  if (Number.isFinite(config.frameCount) && config.frameCount < 1) {
    issues.push({ field: 'frameCount', message: 'frameCount must be >= 1', severity: 'warning' });
  }

  // Inverted min/max ranges still simulate (the spawn interpolation handles a > b)
  // but almost always indicate an authoring mistake.
  reportInvertedRange(issues, config, 'lifetimeMin', 'lifetimeMax');
  reportInvertedRange(issues, config, 'speedMin', 'speedMax');
  reportInvertedRange(issues, config, 'scaleMin', 'scaleMax');
  reportInvertedRange(issues, config, 'rotationSpeedMin', 'rotationSpeedMax');

  reportUnitRange(issues, config, 'alphaStart');
  reportUnitRange(issues, config, 'alphaEnd');

  reportCurve(issues, config.alphaCurve, 'alphaCurve', 1);
  reportCurve(issues, config.colorCurve, 'colorCurve', 3);
  reportCurve(issues, config.scaleCurve, 'scaleCurve', 1);

  return issues;
}

function isFiniteCurve(curve: ReadonlyArray<number> | null): curve is ReadonlyArray<number> {
  if (curve == null || curve.length === 0) return false;
  for (let i = 0; i < curve.length; i++) {
    if (!Number.isFinite(curve[i])) return false;
  }
  return true;
}

function reportCurve(
  issues: ParticleConfigIssue[],
  curve: ReadonlyArray<number> | null,
  field: keyof ParticleEmitterConfig,
  stride: number,
): void {
  if (curve == null) return;
  if (curve.length === 0) {
    issues.push({ field, message: `${field} is empty and will be ignored`, severity: 'warning' });
    return;
  }
  if (curve.length % stride !== 0) {
    issues.push({
      field,
      message: `${field} length (${curve.length}) is not a multiple of ${stride}`,
      severity: 'warning',
    });
  }
  for (let i = 0; i < curve.length; i++) {
    if (!Number.isFinite(curve[i])) {
      issues.push({ field, message: `${field} contains a non-finite sample at index ${i}`, severity: 'error' });
      break;
    }
  }
}

function reportInvertedRange(
  issues: ParticleConfigIssue[],
  config: Readonly<ParticleEmitterConfig>,
  minField: keyof ParticleEmitterConfig,
  maxField: keyof ParticleEmitterConfig,
): void {
  const min = config[minField];
  const max = config[maxField];
  if (Number.isFinite(min) && Number.isFinite(max) && (min as number) > (max as number)) {
    issues.push({
      field: minField,
      message: `${minField} (${min}) is greater than ${maxField} (${max})`,
      severity: 'warning',
    });
  }
}

function reportUnitRange(
  issues: ParticleConfigIssue[],
  config: Readonly<ParticleEmitterConfig>,
  field: keyof ParticleEmitterConfig,
): void {
  const value = config[field];
  if (Number.isFinite(value) && ((value as number) < 0 || (value as number) > 1)) {
    issues.push({ field, message: `${field} (${value}) is outside the expected 0–1 range`, severity: 'warning' });
  }
}

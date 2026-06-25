import type { ParticleEmitterConfig } from '@flighthq/types';

import type { ParticleDesignerDocument } from './particleDesignerSchema';
import type { ParticleSerializeResult } from './serializeResult';

export interface ParticleDesignerSerializeOptions {
  /** Side length of the particle texture in pixels — reverses the normalisation
   *  applied during parsing.  Defaults to 1. */
  textureSize?: number;
}

const RAD2DEG = 180 / Math.PI;

function configToDocument(
  config: Readonly<ParticleEmitterConfig>,
  existing: Partial<ParticleDesignerDocument>,
  textureSize: number,
): ParticleDesignerDocument {
  // Direction vector → degrees (0°=right, 90°=up-screen)
  const angleDeg = Math.atan2(-config.directionY, config.directionX) * RAD2DEG;

  // Scale multipliers → absolute pixel sizes
  const startSize = (config.scaleMin + config.scaleMax) * 0.5 * textureSize;
  const startVar = (config.scaleMax - config.scaleMin) * 0.5 * textureSize;
  const finishSize = startSize * config.scaleEnd;

  // Rotation speed → Particle Designer rotation range
  const rotSpeedMid = (config.rotationSpeedMin + config.rotationSpeedMax) * 0.5;
  const rotSpeedVar = (config.rotationSpeedMax - config.rotationSpeedMin) * 0.5;
  const lifetimeMid = (config.lifetimeMin + config.lifetimeMax) * 0.5;
  const rotStart = rotSpeedMid * lifetimeMid * RAD2DEG;
  const rotVar = rotSpeedVar * lifetimeMid * RAD2DEG;

  // Emitter shape → sourcePositionVariance
  let vx = 0;
  let vy = 0;
  if (config.emitterShape === 'circle') {
    vx = config.emitterRadius;
    vy = config.emitterRadius;
  } else if (config.emitterShape === 'rect') {
    vx = config.emitterWidth * 0.5;
    vy = config.emitterHeight * 0.5;
  }

  return {
    maxParticles: config.maxParticles,
    emitterType: existing.emitterType ?? 0,
    duration: config.duration > 0 && !config.loop ? config.duration : (existing.duration ?? -1),
    particleLifespan: (config.lifetimeMin + config.lifetimeMax) * 0.5,
    particleLifespanVariance: (config.lifetimeMax - config.lifetimeMin) * 0.5,
    speed: (config.speedMin + config.speedMax) * 0.5,
    speedVariance: (config.speedMax - config.speedMin) * 0.5,
    angle: angleDeg,
    angleVariance: config.spread * RAD2DEG,
    gravityx: config.gravityX,
    gravityy: config.gravityY,
    sourcePositionVariancex: vx,
    sourcePositionVariancey: vy,
    startParticleSize: startSize,
    startParticleSizeVariance: startVar,
    finishParticleSize: finishSize,
    finishParticleSizeVariance: existing.finishParticleSizeVariance ?? 0,
    startColorRed: config.colorStartR,
    startColorGreen: config.colorStartG,
    startColorBlue: config.colorStartB,
    startColorAlpha: config.alphaStart,
    startColorVarianceRed:
      config.colorStartVarianceR !== 0 ? config.colorStartVarianceR : (existing.startColorVarianceRed ?? 0),
    startColorVarianceGreen:
      config.colorStartVarianceG !== 0 ? config.colorStartVarianceG : (existing.startColorVarianceGreen ?? 0),
    startColorVarianceBlue:
      config.colorStartVarianceB !== 0 ? config.colorStartVarianceB : (existing.startColorVarianceBlue ?? 0),
    startColorVarianceAlpha: existing.startColorVarianceAlpha ?? 0,
    finishColorRed: config.colorEndR,
    finishColorGreen: config.colorEndG,
    finishColorBlue: config.colorEndB,
    finishColorAlpha: config.alphaEnd,
    finishColorVarianceRed:
      config.colorEndVarianceR !== 0 ? config.colorEndVarianceR : (existing.finishColorVarianceRed ?? 0),
    finishColorVarianceGreen:
      config.colorEndVarianceG !== 0 ? config.colorEndVarianceG : (existing.finishColorVarianceGreen ?? 0),
    finishColorVarianceBlue:
      config.colorEndVarianceB !== 0 ? config.colorEndVarianceB : (existing.finishColorVarianceBlue ?? 0),
    finishColorVarianceAlpha: existing.finishColorVarianceAlpha ?? 0,
    rotationStart: rotStart,
    rotationStartVariance: rotVar,
    rotationEnd: rotStart,
    rotationEndVariance: rotVar,
    maxRadius: existing.maxRadius ?? 0,
    maxRadiusVariance: existing.maxRadiusVariance ?? 0,
    minRadius: existing.minRadius ?? 0,
    minRadiusVariance: existing.minRadiusVariance ?? 0,
    rotatePerSecond: existing.rotatePerSecond ?? 0,
    rotatePerSecondVariance: existing.rotatePerSecondVariance ?? 0,
    blendFuncSource: blendModeToSrc(config.blendMode, existing.blendFuncSource ?? 770),
    blendFuncDestination: blendModeToDst(config.blendMode, existing.blendFuncDestination ?? 771),
    textureFileName: existing.textureFileName ?? '',
  };
}

function documentToPlist(doc: ParticleDesignerDocument): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
  ];

  function kv(key: string, value: string | number | boolean): void {
    lines.push(`\t<key>${key}</key>`);
    if (typeof value === 'boolean') {
      lines.push(`\t<${value ? 'true' : 'false'}/>`);
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) lines.push(`\t<integer>${value}</integer>`);
      else lines.push(`\t<real>${value}</real>`);
    } else {
      lines.push(`\t<string>${escapeXml(value)}</string>`);
    }
  }

  kv('maxParticles', doc.maxParticles);
  kv('emitterType', doc.emitterType);
  kv('duration', doc.duration);
  kv('particleLifespan', doc.particleLifespan);
  kv('particleLifespanVariance', doc.particleLifespanVariance);
  kv('speed', doc.speed);
  kv('speedVariance', doc.speedVariance);
  kv('angle', doc.angle);
  kv('angleVariance', doc.angleVariance);
  kv('gravityx', doc.gravityx);
  kv('gravityy', doc.gravityy);
  kv('sourcePositionVariancex', doc.sourcePositionVariancex);
  kv('sourcePositionVariancey', doc.sourcePositionVariancey);
  kv('startParticleSize', doc.startParticleSize);
  kv('startParticleSizeVariance', doc.startParticleSizeVariance);
  kv('finishParticleSize', doc.finishParticleSize);
  kv('finishParticleSizeVariance', doc.finishParticleSizeVariance);
  kv('startColorRed', doc.startColorRed);
  kv('startColorGreen', doc.startColorGreen);
  kv('startColorBlue', doc.startColorBlue);
  kv('startColorAlpha', doc.startColorAlpha);
  kv('startColorVarianceRed', doc.startColorVarianceRed);
  kv('startColorVarianceGreen', doc.startColorVarianceGreen);
  kv('startColorVarianceBlue', doc.startColorVarianceBlue);
  kv('startColorVarianceAlpha', doc.startColorVarianceAlpha);
  kv('finishColorRed', doc.finishColorRed);
  kv('finishColorGreen', doc.finishColorGreen);
  kv('finishColorBlue', doc.finishColorBlue);
  kv('finishColorAlpha', doc.finishColorAlpha);
  kv('finishColorVarianceRed', doc.finishColorVarianceRed);
  kv('finishColorVarianceGreen', doc.finishColorVarianceGreen);
  kv('finishColorVarianceBlue', doc.finishColorVarianceBlue);
  kv('finishColorVarianceAlpha', doc.finishColorVarianceAlpha);
  kv('rotationStart', doc.rotationStart);
  kv('rotationStartVariance', doc.rotationStartVariance);
  kv('rotationEnd', doc.rotationEnd);
  kv('rotationEndVariance', doc.rotationEndVariance);
  kv('maxRadius', doc.maxRadius);
  kv('maxRadiusVariance', doc.maxRadiusVariance);
  kv('minRadius', doc.minRadius);
  kv('minRadiusVariance', doc.minRadiusVariance);
  kv('rotatePerSecond', doc.rotatePerSecond);
  kv('rotatePerSecondVariance', doc.rotatePerSecondVariance);
  kv('blendFuncSource', doc.blendFuncSource);
  kv('blendFuncDestination', doc.blendFuncDestination);
  kv('textureFileName', doc.textureFileName);

  lines.push('</dict>');
  lines.push('</plist>');
  return lines.join('\n');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function blendModeToSrc(mode: string | null | undefined, fallback: number): number {
  if (mode === 'add') return 770; // GL_SRC_ALPHA
  if (mode === 'normal') return 770;
  return fallback;
}

function blendModeToDst(mode: string | null | undefined, fallback: number): number {
  if (mode === 'add') return 1; // GL_ONE
  if (mode === 'normal') return 771; // GL_ONE_MINUS_SRC_ALPHA
  return fallback;
}

/** Serialise a ParticleEmitterConfig to a Particle Designer plist XML string.
 *
 *  Pass the `document` returned by `parseParticleDesignerPlist` to preserve
 *  any fields that don't round-trip through the config (texture name, blend
 *  function, emitter type, duration, color variances). */
export function serializeParticleDesignerPlist(
  config: Readonly<ParticleEmitterConfig>,
  existing?: Partial<ParticleDesignerDocument>,
  options?: ParticleDesignerSerializeOptions,
): string {
  const textureSize = options?.textureSize ?? 1;
  const doc = configToDocument(config, existing ?? {}, textureSize);
  return documentToPlist(doc);
}

/** Serialise a ParticleEmitterConfig to a Particle Designer plist XML string,
 *  returning both the serialized text and any warnings for features the format
 *  cannot represent.
 *
 *  Pass the `document` returned by `parseParticleDesignerPlistDocument` to
 *  preserve any fields that don't round-trip through the config. */
export function serializeParticleDesignerPlistDocument(
  config: Readonly<ParticleEmitterConfig>,
  existing?: Partial<ParticleDesignerDocument>,
  options?: ParticleDesignerSerializeOptions,
): ParticleSerializeResult {
  const text = serializeParticleDesignerPlist(config, existing, options);
  const warnings = collectParticleDesignerSerializeWarnings(config);
  return { text, warnings };
}

/** Collect serialize-side warnings for features in `config` that the Particle
 *  Designer plist format cannot represent. */
function collectParticleDesignerSerializeWarnings(config: Readonly<ParticleEmitterConfig>): string[] {
  const warnings: string[] = [];
  if (config.blendMode !== null && config.blendMode !== 'add' && config.blendMode !== 'normal') {
    warnings.push(
      `Blend mode '${config.blendMode}' has no Particle Designer equivalent and was approximated as 'normal'`,
    );
  }
  if (config.colorCurve !== null) {
    warnings.push('Color curve has more than two stops; Particle Designer stores only start and end colors');
  }
  if (config.alphaCurve !== null) {
    warnings.push('Alpha curve has more than two stops; Particle Designer stores only start and end alpha');
  }
  if (config.scaleCurve !== null) {
    warnings.push('Scale curve has more than two stops; Particle Designer stores only start and end size');
  }
  if (config.burstCount > 0) {
    warnings.push('Emission bursts are not supported by the Particle Designer format and were ignored');
  }
  if (config.velocityInheritance !== 0) {
    warnings.push('velocityInheritance is not supported by the Particle Designer format and was ignored');
  }
  return warnings;
}

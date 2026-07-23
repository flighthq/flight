import type {
  StarlingPexSerializeOptions,
  ParticleEmitterConfig,
  ParticleSerializeResult,
  StarlingPexColor,
  StarlingPexDocument,
} from '@flighthq/types';

/** Serialise a ParticleEmitterConfig to a Starling / Sparrow PEX XML string
 *  (attribute style).
 *
 *  Pass the `document` returned by `parseStarlingPexDocument` to preserve fields
 *  that don't round-trip through the config (texture filename, emitter type,
 *  radial parameters). */
export function serializeStarlingPex(
  config: Readonly<ParticleEmitterConfig>,
  existing?: Partial<StarlingPexDocument>,
  options?: StarlingPexSerializeOptions,
): string {
  const textureSize = options?.textureSize ?? 1;
  const doc = configToDocument(config, existing ?? {}, textureSize);
  return documentToXml(doc);
}

/** Serialise a ParticleEmitterConfig to a Starling / Sparrow PEX XML string,
 *  returning both the serialized text and any warnings for features the format
 *  cannot represent. */
export function serializeStarlingPexDocument(
  config: Readonly<ParticleEmitterConfig>,
  existing?: Partial<StarlingPexDocument>,
  options?: StarlingPexSerializeOptions,
): ParticleSerializeResult {
  const text = serializeStarlingPex(config, existing, options);
  const warnings = collectStarlingPexSerializeWarnings(config);
  return { text, warnings };
}

const RAD2DEG = 180 / Math.PI;

function collectStarlingPexSerializeWarnings(config: Readonly<ParticleEmitterConfig>): string[] {
  const warnings: string[] = [];
  if (config.blendMode !== null && config.blendMode !== 'add' && config.blendMode !== 'normal') {
    warnings.push(`Blend mode '${config.blendMode}' has no Starling PEX equivalent and was approximated as 'normal'`);
  }
  if (config.colorCurve !== null) {
    warnings.push('Color curve has more than two stops; Starling PEX stores only start and end colors');
  }
  if (config.alphaCurve !== null) {
    warnings.push('Alpha curve has more than two stops; Starling PEX stores only start and end alpha');
  }
  if (config.scaleCurve !== null) {
    warnings.push('Scale curve has more than two stops; Starling PEX stores only start and end size');
  }
  if (config.burstCount > 0) {
    warnings.push('Emission bursts are not supported by the Starling PEX format and were ignored');
  }
  if (config.velocityInheritance !== 0) {
    warnings.push('velocityInheritance is not supported by the Starling PEX format and was ignored');
  }
  return warnings;
}

function colorAttr(name: string, c: Readonly<StarlingPexColor>): string {
  return `  <attribute name="${name}" red="${c.red}" green="${c.green}" blue="${c.blue}" alpha="${c.alpha}"/>`;
}

function configToDocument(
  config: Readonly<ParticleEmitterConfig>,
  existing: Partial<StarlingPexDocument>,
  textureSize: number,
): StarlingPexDocument {
  const angleDeg = Math.atan2(-config.directionY, config.directionX) * RAD2DEG;
  const startSize = (config.scaleMin + config.scaleMax) * 0.5 * textureSize;
  const startVar = (config.scaleMax - config.scaleMin) * 0.5 * textureSize;
  const finishSize = startSize * config.scaleEnd;
  const rotSpeedMid = (config.rotationSpeedMin + config.rotationSpeedMax) * 0.5;
  const rotSpeedVar = (config.rotationSpeedMax - config.rotationSpeedMin) * 0.5;
  const lifetimeMid = (config.lifetimeMin + config.lifetimeMax) * 0.5;
  const rotStart = rotSpeedMid * lifetimeMid * RAD2DEG;
  const rotVar = rotSpeedVar * lifetimeMid * RAD2DEG;
  let vx = 0;
  let vy = 0;
  if (config.emitterShape === 'circle') {
    vx = config.emitterRadius;
    vy = config.emitterRadius;
  } else if (config.emitterShape === 'rect') {
    vx = config.emitterWidth * 0.5;
    vy = config.emitterHeight * 0.5;
  }
  const blendMode = config.blendMode;
  const src = blendMode === 'add' ? 770 : (existing.blendFuncSource ?? 770);
  const dst = blendMode === 'add' ? 1 : blendMode === 'normal' ? 771 : (existing.blendFuncDestination ?? 771);
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
    startColor: {
      red: config.colorStartR,
      green: config.colorStartG,
      blue: config.colorStartB,
      alpha: config.alphaStart,
    },
    startColorVariance: {
      red: config.colorStartVarianceR !== 0 ? config.colorStartVarianceR : (existing.startColorVariance?.red ?? 0),
      green: config.colorStartVarianceG !== 0 ? config.colorStartVarianceG : (existing.startColorVariance?.green ?? 0),
      blue: config.colorStartVarianceB !== 0 ? config.colorStartVarianceB : (existing.startColorVariance?.blue ?? 0),
      alpha: existing.startColorVariance?.alpha ?? 0,
    },
    finishColor: {
      red: config.colorEndR,
      green: config.colorEndG,
      blue: config.colorEndB,
      alpha: config.alphaEnd,
    },
    finishColorVariance: {
      red: config.colorEndVarianceR !== 0 ? config.colorEndVarianceR : (existing.finishColorVariance?.red ?? 0),
      green: config.colorEndVarianceG !== 0 ? config.colorEndVarianceG : (existing.finishColorVariance?.green ?? 0),
      blue: config.colorEndVarianceB !== 0 ? config.colorEndVarianceB : (existing.finishColorVariance?.blue ?? 0),
      alpha: existing.finishColorVariance?.alpha ?? 0,
    },
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
    radialAcceleration: existing.radialAcceleration ?? 0,
    radialAccelVariance: existing.radialAccelVariance ?? 0,
    tangentialAcceleration: existing.tangentialAcceleration ?? 0,
    tangentialAccelVariance: existing.tangentialAccelVariance ?? 0,
    blendFuncSource: src,
    blendFuncDestination: dst,
    textureFileName: existing.textureFileName ?? '',
  };
}

function documentToXml(doc: Readonly<StarlingPexDocument>): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<particleEmitterConfig>',
    `  <attribute name="maxParticles" value="${doc.maxParticles}"/>`,
    `  <attribute name="emitterType" value="${doc.emitterType}"/>`,
    numAttr('duration', doc.duration),
    numAttr('particleLifespan', doc.particleLifespan),
    numAttr('particleLifespanVariance', doc.particleLifespanVariance),
    numAttr('speed', doc.speed),
    numAttr('speedVariance', doc.speedVariance),
    numAttr('angle', doc.angle),
    numAttr('angleVariance', doc.angleVariance),
    numAttr('gravityx', doc.gravityx),
    numAttr('gravityy', doc.gravityy),
    numAttr('sourcePositionVariancex', doc.sourcePositionVariancex),
    numAttr('sourcePositionVariancey', doc.sourcePositionVariancey),
    numAttr('startParticleSize', doc.startParticleSize),
    numAttr('startParticleSizeVariance', doc.startParticleSizeVariance),
    numAttr('finishParticleSize', doc.finishParticleSize),
    numAttr('finishParticleSizeVariance', doc.finishParticleSizeVariance),
    colorAttr('startColor', doc.startColor),
    colorAttr('startColorVariance', doc.startColorVariance),
    colorAttr('finishColor', doc.finishColor),
    colorAttr('finishColorVariance', doc.finishColorVariance),
    numAttr('rotationStart', doc.rotationStart),
    numAttr('rotationStartVariance', doc.rotationStartVariance),
    numAttr('rotationEnd', doc.rotationEnd),
    numAttr('rotationEndVariance', doc.rotationEndVariance),
    numAttr('maxRadius', doc.maxRadius),
    numAttr('maxRadiusVariance', doc.maxRadiusVariance),
    numAttr('minRadius', doc.minRadius),
    numAttr('minRadiusVariance', doc.minRadiusVariance),
    numAttr('rotatePerSecond', doc.rotatePerSecond),
    numAttr('rotatePerSecondVariance', doc.rotatePerSecondVariance),
    numAttr('radialAcceleration', doc.radialAcceleration),
    numAttr('radialAccelVariance', doc.radialAccelVariance),
    numAttr('tangentialAcceleration', doc.tangentialAcceleration),
    numAttr('tangentialAccelVariance', doc.tangentialAccelVariance),
    numAttr('blendFuncSource', doc.blendFuncSource),
    numAttr('blendFuncDestination', doc.blendFuncDestination),
  ];
  if (doc.textureFileName) {
    lines.push(`  <attribute name="textureFileName" value="${escapeXml(doc.textureFileName)}"/>`);
  }
  lines.push('</particleEmitterConfig>');
  return lines.join('\n');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function numAttr(name: string, value: number): string {
  return `  <attribute name="${name}" value="${value}"/>`;
}

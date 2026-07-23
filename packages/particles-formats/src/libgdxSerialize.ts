import type {
  LibgdxSerializeOptions,
  ParticleEmitterConfig,
  LibgdxParticleDocument,
  LibgdxRangeValue,
  ParticleSerializeResult,
} from '@flighthq/types';

/** Serialise a ParticleEmitterConfig to a libGDX 2D Particle Editor `.p` file string.
 *
 *  Pass the `document` returned by `parseLibgdxParticleDocument` to preserve any fields
 *  that don't round-trip through the config (texture path, emitter name, etc.). */
export function serializeLibgdxParticle(
  config: Readonly<ParticleEmitterConfig>,
  existing?: Partial<LibgdxParticleDocument>,
  options?: LibgdxSerializeOptions,
): string {
  const textureSize = options?.textureSize ?? 1;
  const doc = configToDocument(config, existing ?? {}, textureSize);
  return documentToText(doc);
}

/** Serialise a ParticleEmitterConfig to a libGDX 2D Particle Editor `.p` file string,
 *  returning both the serialized text and any warnings for features the format cannot represent. */
export function serializeLibgdxParticleDocument(
  config: Readonly<ParticleEmitterConfig>,
  existing?: Partial<LibgdxParticleDocument>,
  options?: LibgdxSerializeOptions,
): ParticleSerializeResult {
  const text = serializeLibgdxParticle(config, existing, options);
  const warnings = collectLibgdxSerializeWarnings(config);
  return { text, warnings };
}

const RAD2DEG = 180 / Math.PI;

function collectLibgdxSerializeWarnings(config: Readonly<ParticleEmitterConfig>): string[] {
  const warnings: string[] = [];
  if (config.blendMode !== null && config.blendMode !== 'add' && config.blendMode !== 'normal') {
    warnings.push(`Blend mode '${config.blendMode}' has no libGDX equivalent and was approximated as 'normal'`);
  }
  if (config.colorCurve !== null) {
    warnings.push('Color curve has more than two stops; libGDX stores only start and end color');
  }
  if (config.alphaCurve !== null) {
    warnings.push(
      'Alpha curve has more than two stops; libGDX stores only start and end alpha via transparency scaling',
    );
  }
  if (config.burstCount > 0) {
    warnings.push('Emission bursts are not supported by the libGDX format and were ignored');
  }
  if (config.colorStartVarianceR !== 0 || config.colorStartVarianceG !== 0 || config.colorStartVarianceB !== 0) {
    warnings.push('colorStartVariance is not supported by the libGDX format and was ignored');
  }
  if (config.colorEndVarianceR !== 0 || config.colorEndVarianceG !== 0 || config.colorEndVarianceB !== 0) {
    warnings.push('colorEndVariance is not supported by the libGDX format and was ignored');
  }
  if (config.velocityInheritance !== 0) {
    warnings.push('velocityInheritance is not supported by the libGDX format and was ignored');
  }
  return warnings;
}

function configToDocument(
  config: Readonly<ParticleEmitterConfig>,
  existing: Partial<LibgdxParticleDocument>,
  textureSize: number,
): LibgdxParticleDocument {
  const angleMid = Math.atan2(-config.directionY, config.directionX) * RAD2DEG;
  const spreadDeg = config.spread * RAD2DEG;
  const angleMin = angleMid - spreadDeg;
  const angleMax = angleMid + spreadDeg;
  const scaleMinPx = config.scaleMin * textureSize;
  const scaleMaxPx = config.scaleMax * textureSize;
  // Emitter shape -> spawn shape
  let spawnShape: LibgdxParticleDocument['spawnShape'] = { shape: 'point', edges: false, side: 'both' };
  let spawnWidth = makeConstRange(0);
  let spawnHeight = makeConstRange(0);
  if (config.emitterShape === 'circle') {
    spawnShape = { shape: 'ellipse', edges: false, side: 'both' };
    const diam = config.emitterRadius * 2;
    spawnWidth = makeConstRange(diam);
    spawnHeight = makeConstRange(diam);
  } else if (config.emitterShape === 'rect') {
    spawnShape = { shape: 'square', edges: false, side: 'both' };
    spawnWidth = makeConstRange(config.emitterWidth);
    spawnHeight = makeConstRange(config.emitterHeight);
  }
  const lifetimeMid = (config.lifetimeMin + config.lifetimeMax) * 0.5 || 1;
  const rotDegMin = config.rotationSpeedMin * RAD2DEG * lifetimeMid;
  const rotDegMax = config.rotationSpeedMax * RAD2DEG * lifetimeMid;
  // Duration: infinite if looping, otherwise use duration in ms
  const durMs = config.loop ? -1 : config.duration > 0 ? config.duration * 1000 : 3000;
  const durVal = durMs > 0 ? durMs : 3000;
  return {
    name: existing.name ?? '',
    minParticleCount: existing.minParticleCount ?? 0,
    maxParticleCount: config.maxParticles,
    additive: config.blendMode === 'add',
    premultipliedAlpha: existing.premultipliedAlpha ?? false,
    delay: existing.delay ?? {
      active: false,
      lowMin: 0,
      lowMax: 0,
      highMin: 0,
      highMax: 0,
      relative: false,
      scaling: [1],
      timeline: [0],
    },
    duration: makeConstRange(durVal),
    emission: makeConstRange(config.spawnRate),
    life: {
      lowMin: config.lifetimeMin * 1000,
      lowMax: config.lifetimeMin * 1000,
      highMin: config.lifetimeMax * 1000,
      highMax: config.lifetimeMax * 1000,
      relative: false,
      scaling: [1],
      timeline: [0],
    },
    lifeOffset: existing.lifeOffset ?? {
      active: false,
      lowMin: 0,
      lowMax: 0,
      highMin: 0,
      highMax: 0,
      relative: false,
      scaling: [1],
      timeline: [0],
    },
    xOffset: existing.xOffset ?? {
      active: false,
      lowMin: 0,
      lowMax: 0,
      highMin: 0,
      highMax: 0,
      relative: false,
      scaling: [1],
      timeline: [0],
    },
    yOffset: existing.yOffset ?? {
      active: false,
      lowMin: 0,
      lowMax: 0,
      highMin: 0,
      highMax: 0,
      relative: false,
      scaling: [1],
      timeline: [0],
    },
    spawnShape,
    spawnWidth,
    spawnHeight,
    scale: {
      lowMin: scaleMinPx,
      lowMax: scaleMinPx,
      highMin: scaleMaxPx,
      highMax: scaleMaxPx,
      relative: false,
      scaling: [1, config.scaleEnd],
      timeline: [0, 1],
    },
    velocity: {
      active: true,
      lowMin: config.speedMin,
      lowMax: config.speedMin,
      highMin: config.speedMax,
      highMax: config.speedMax,
      relative: false,
      scaling: [1],
      timeline: [0],
    },
    angle: {
      active: true,
      lowMin: angleMin,
      lowMax: angleMin,
      highMin: angleMax,
      highMax: angleMax,
      relative: false,
      scaling: [1],
      timeline: [0],
    },
    rotation: {
      active: rotDegMin !== 0 || rotDegMax !== 0,
      lowMin: rotDegMin,
      lowMax: rotDegMin,
      highMin: rotDegMax,
      highMax: rotDegMax,
      relative: false,
      scaling: [1],
      timeline: [0],
    },
    wind: {
      active: config.gravityX !== 0,
      lowMin: config.gravityX,
      lowMax: config.gravityX,
      highMin: config.gravityX,
      highMax: config.gravityX,
      relative: false,
      scaling: [1],
      timeline: [0],
    },
    gravity: {
      active: config.gravityY !== 0,
      lowMin: config.gravityY,
      lowMax: config.gravityY,
      highMin: config.gravityY,
      highMax: config.gravityY,
      relative: false,
      scaling: [1],
      timeline: [0],
    },
    tint: {
      colors: [
        rgbToHex(config.colorStartR, config.colorStartG, config.colorStartB),
        rgbToHex(config.colorEndR, config.colorEndG, config.colorEndB),
      ],
      timeline: [0, 1],
    },
    transparency: {
      lowMin: 0,
      lowMax: 0,
      highMin: 1,
      highMax: 1,
      relative: false,
      scaling: [config.alphaStart, config.alphaEnd],
      timeline: [0, 1],
    },
    imageCount: existing.imageCount ?? 1,
    imagePath: existing.imagePath ?? '',
  };
}

function documentToText(doc: Readonly<LibgdxParticleDocument>): string {
  const lines: string[] = [];
  lines.push('Particle Effect');
  if (doc.name) lines.push(`- ${doc.name} -`);
  lines.push(`minParticleCount: ${doc.minParticleCount}`);
  lines.push(`maxParticleCount: ${doc.maxParticleCount}`);
  lines.push(`additive: ${doc.additive}`);
  if (doc.premultipliedAlpha) lines.push(`premultipliedAlpha: ${doc.premultipliedAlpha}`);
  if (doc.imagePath) lines.push(`imagePath: ${doc.imagePath}`);
  if (doc.imageCount !== 1) lines.push(`imageCount: ${doc.imageCount}`);
  lines.push('');
  lines.push(...rangeToLines('Delay', doc.delay, doc.delay.active));
  lines.push('');
  lines.push(...rangeToLines('Duration', doc.duration));
  lines.push('');
  lines.push(...rangeToLines('Emission', doc.emission));
  lines.push('');
  lines.push(...rangeToLines('Life', doc.life));
  lines.push('');
  lines.push(...rangeToLines('Life Offset', doc.lifeOffset, doc.lifeOffset.active));
  lines.push('');
  lines.push(...rangeToLines('X Offset', doc.xOffset, doc.xOffset.active));
  lines.push('');
  lines.push(...rangeToLines('Y Offset', doc.yOffset, doc.yOffset.active));
  lines.push('');
  lines.push('Spawn Shape');
  lines.push(`shape: ${doc.spawnShape.shape}`);
  if (doc.spawnShape.shape === 'ellipse') {
    lines.push(`edges: ${doc.spawnShape.edges}`);
    lines.push(`side: ${doc.spawnShape.side}`);
  }
  lines.push('');
  lines.push(...rangeToLines('Spawn Width', doc.spawnWidth));
  lines.push('');
  lines.push(...rangeToLines('Spawn Height', doc.spawnHeight));
  lines.push('');
  lines.push(...rangeToLines('Scale', doc.scale));
  lines.push('');
  lines.push(...rangeToLines('Velocity', doc.velocity, doc.velocity.active));
  lines.push('');
  lines.push(...rangeToLines('Angle', doc.angle, doc.angle.active));
  lines.push('');
  lines.push(...rangeToLines('Rotation', doc.rotation, doc.rotation.active));
  lines.push('');
  lines.push(...rangeToLines('Wind', doc.wind, doc.wind.active));
  lines.push('');
  lines.push(...rangeToLines('Gravity', doc.gravity, doc.gravity.active));
  lines.push('');
  lines.push('Tint');
  lines.push(`colors: ${doc.tint.colors.join(',')}`);
  lines.push(`timelineCount: ${doc.tint.timeline.length}`);
  doc.tint.timeline.forEach((v, i) => lines.push(`timeline${i}: ${v}`));
  lines.push('');
  lines.push(...rangeToLines('Transparency', doc.transparency));
  lines.push('');
  return lines.join('\n');
}

function makeConstRange(v: number): LibgdxRangeValue {
  return { lowMin: v, lowMax: v, highMin: v, highMax: v, relative: false, scaling: [1], timeline: [0] };
}

function rangeToLines(section: string, r: Readonly<LibgdxRangeValue>, active?: boolean): string[] {
  const lines = [section];
  if (active !== undefined) lines.push(`active: ${active}`);
  lines.push(`lowMin: ${r.lowMin}`);
  lines.push(`lowMax: ${r.lowMax}`);
  lines.push(`highMin: ${r.highMin}`);
  lines.push(`highMax: ${r.highMax}`);
  lines.push(`relative: ${r.relative}`);
  lines.push(`scalingCount: ${r.scaling.length}`);
  r.scaling.forEach((v, i) => lines.push(`scaling${i}: ${v}`));
  lines.push(`timelineCount: ${r.timeline.length}`);
  r.timeline.forEach((v, i) => lines.push(`timeline${i}: ${v}`));
  return lines;
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `${c(r)}${c(g)}${c(b)}`;
}

import { createParticleEmitterConfig } from '@flighthq/particles';
import type {
  LibgdxParseOptions,
  LibgdxParseResult,
  ParticleEmitterConfig,
  LibgdxParticleDocument,
  LibgdxRangeValue,
} from '@flighthq/types';

/** @deprecated Use `LibgdxParseResult`. */
/** Parse a libGDX 2D Particle Editor `.p` file string directly to a ParticleEmitterConfig.
 *
 *  Single-pass: no intermediate document object is allocated.
 *  Use `parseLibgdxParticleDocument` instead when you need round-trip serialisation.
 *  Throws a clear, format-tagged error when the input cannot be parsed. */
export function parseLibgdxParticle(text: string, options?: LibgdxParseOptions): ParticleEmitterConfig {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Invalid libGDX particle: input is empty or not a string');
  }
  const { sections } = parseLibgdxText(text);
  const doc = sectionsToDocument(sections);
  return documentToConfig(doc, options?.textureSize ?? 1);
}

/** Parse a libGDX 2D Particle Editor `.p` file string and preserve the full document
 *  for round-trip serialisation via `serializeLibgdxParticle`.
 *  Throws a clear, format-tagged error when the input cannot be parsed. */
export function parseLibgdxParticleDocument(text: string, options?: LibgdxParseOptions): LibgdxParseResult {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Invalid libGDX particle: input is empty or not a string');
  }
  const { sections } = parseLibgdxText(text);
  const doc = sectionsToDocument(sections);
  const textureSize = options?.textureSize ?? 1;
  return {
    config: documentToConfig(doc, textureSize),
    document: doc,
    warnings: collectLibgdxWarnings(doc),
  };
}

const DEG2RAD = Math.PI / 180;

type LibgdxSection = Map<string, string>;

function boolKey(section: LibgdxSection, key: string, def = false): boolean {
  const v = section.get(key);
  if (v === undefined) return def;
  return v === 'true';
}

function collectLibgdxWarnings(doc: LibgdxParticleDocument): string[] {
  const warnings: string[] = [];
  if (doc.delay.active) warnings.push('libGDX emission delay is not supported and was ignored');
  if (doc.lifeOffset.active) warnings.push('libGDX lifeOffset is not supported and was ignored');
  if (doc.xOffset.active || doc.yOffset.active) {
    warnings.push('libGDX emitter x/y position offsets are not supported and were ignored');
  }
  if (doc.premultipliedAlpha) {
    warnings.push('libGDX premultipliedAlpha flag is informational only; blending behavior may differ');
  }
  if (doc.spawnShape.shape === 'line') {
    warnings.push('libGDX line spawn shape has no equivalent and was mapped to point emitter');
  }
  return warnings;
}

function documentToConfig(doc: LibgdxParticleDocument, textureSize: number): ParticleEmitterConfig {
  const [lifeMin, lifeMax] = rangeToMinMax(doc.life);
  const [velMin, velMax] = doc.velocity.active ? rangeToMinMax(doc.velocity) : [0, 0];
  const [angleMin, angleMax] = doc.angle.active ? rangeToMinMax(doc.angle) : [0, 360];
  const angleMid = (angleMin + angleMax) * 0.5 * DEG2RAD;
  const spread = (angleMax - angleMin) * 0.5 * DEG2RAD;
  const [scaleMinPx, scaleMaxPx] = rangeToMinMax(doc.scale);
  const scaleMin = scaleMinPx / textureSize;
  const scaleMax = scaleMaxPx / textureSize;
  // Scale end: use last scaling value (libGDX stores the scale curve as normalised scalings).
  const lastScaling = doc.scale.scaling.length > 0 ? doc.scale.scaling[doc.scale.scaling.length - 1] : 1;
  const scaleEnd = lastScaling;
  const [windMin] = doc.wind.active ? rangeToMinMax(doc.wind) : [0, 0];
  const [gravMin] = doc.gravity.active ? rangeToMinMax(doc.gravity) : [0, 0];
  // Emitter spawn shape
  const shape = doc.spawnShape.shape;
  const [swMin, swMax] = rangeToMinMax(doc.spawnWidth);
  const [shMin, shMax] = rangeToMinMax(doc.spawnHeight);
  const swMid = (swMin + swMax) * 0.5;
  const shMid = (shMin + shMax) * 0.5;
  let emitterShape: 'point' | 'circle' | 'rect' = 'point';
  let emitterRadius = 0;
  let emitterWidth = 0;
  let emitterHeight = 0;
  if (shape === 'ellipse') {
    if (swMid > 0 && swMid === shMid) {
      emitterShape = 'circle';
      emitterRadius = swMid * 0.5;
    } else if (swMid > 0 || shMid > 0) {
      emitterShape = 'rect';
      emitterWidth = swMid;
      emitterHeight = shMid;
    }
  } else if (shape === 'square') {
    emitterShape = 'rect';
    emitterWidth = swMid;
    emitterHeight = shMid;
  }
  // Colors: first and last tint entry
  const firstColor = doc.tint.colors[0] ?? 'ffffff';
  const lastColor = doc.tint.colors[doc.tint.colors.length - 1] ?? 'ffffff';
  const [sr, sg, sb] = hexToRgb(firstColor);
  const [er, eg, eb] = hexToRgb(lastColor);
  // Alpha: first and last transparency scaling value
  const alphaStart = doc.transparency.scaling[0] ?? 1;
  const alphaEnd = doc.transparency.scaling[doc.transparency.scaling.length - 1] ?? 0;
  // Duration: libGDX lowMin/lowMax is the constant range; use midpoint
  const [durMin, durMax] = rangeToMinMax(doc.duration);
  const durMid = (durMin + durMax) * 0.5;
  // Rotation: libGDX stores angular velocity range
  const [rotMin, rotMax] = doc.rotation.active ? rangeToMinMax(doc.rotation) : [0, 0];
  const lifetimeMid = (lifeMin / 1000 + lifeMax / 1000) * 0.5 || 1;
  const rotSpeedMin = (rotMin * DEG2RAD) / lifetimeMid;
  const rotSpeedMax = (rotMax * DEG2RAD) / lifetimeMid;
  const blendMode = doc.additive ? 'add' : 'normal';
  return createParticleEmitterConfig({
    maxParticles: doc.maxParticleCount,
    loop: durMid <= 0,
    duration: durMid > 0 ? durMid / 1000 : 0,
    lifetimeMin: Math.max(0, lifeMin / 1000),
    lifetimeMax: lifeMax / 1000,
    speedMin: velMin,
    speedMax: velMax,
    directionX: Math.cos(angleMid),
    directionY: -Math.sin(angleMid),
    spread,
    gravityX: windMin,
    gravityY: gravMin,
    emitterShape,
    emitterRadius,
    emitterWidth,
    emitterHeight,
    scaleMin,
    scaleMax,
    scaleEnd,
    colorStartR: sr,
    colorStartG: sg,
    colorStartB: sb,
    colorEndR: er,
    colorEndG: eg,
    colorEndB: eb,
    alphaStart,
    alphaEnd,
    rotationSpeedMin: rotSpeedMin,
    rotationSpeedMax: rotSpeedMax,
    blendMode,
  });
}

function hexToRgb(hex: string): [number, number, number] {
  const s = hex.replace(/^#/, '').padEnd(6, 'f');
  const channel = (i: number) => {
    const v = parseInt(s.slice(i, i + 2), 16);
    return Number.isFinite(v) ? v / 255 : 1;
  };
  return [channel(0), channel(2), channel(4)];
}

function numKey(section: LibgdxSection, key: string, def = 0): number {
  const v = section.get(key);
  if (v === undefined) return def;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : def;
}

/** Parse the libGDX .p text format into a map of section → key/value pairs.
 *
 *  The format is a sequence of:
 *    SectionName           (bare line, no colon)
 *    key: value            (key/value pair belonging to the last section)
 *
 *  Scalar multi-value groups like `scalingCount: N / scaling0: v ... scalingN: v`
 *  are read as individual keys; the caller assembles them into arrays. */
function parseLibgdxText(text: string): { header: string; sections: Map<string, LibgdxSection> } {
  const lines = text.split(/\r?\n/);
  const sections = new Map<string, LibgdxSection>();
  let currentSection = '';
  let current: LibgdxSection = new Map();
  let header = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      // Bare section name. "- Emitter -" or "SectionName" or file header.
      if (currentSection !== '' || current.size > 0) {
        sections.set(currentSection, current);
      }
      currentSection = line;
      current = new Map();
      if (header === '') header = line;
    } else {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      current.set(key, value);
    }
  }
  // Flush last section.
  if (currentSection !== '' || current.size > 0) {
    sections.set(currentSection, current);
  }
  return { header, sections };
}

function rangeToMinMax(r: Readonly<LibgdxRangeValue>): [number, number] {
  // libGDX range: low end is lowMin..lowMax, high end is highMin..highMax.
  // We take the midpoint of each end, then use low as min and high as max.
  const lo = (r.lowMin + r.lowMax) * 0.5;
  const hi = (r.highMin + r.highMax) * 0.5;
  return [Math.min(lo, hi), Math.max(lo, hi)];
}

function readRange(section: LibgdxSection, def: Partial<LibgdxRangeValue> = {}): LibgdxRangeValue {
  const count = numKey(section, 'scalingCount', 1) | 0;
  const scaling: number[] = [];
  const tlCount = numKey(section, 'timelineCount', 1) | 0;
  const timeline: number[] = [];
  for (let i = 0; i < count; i++) scaling.push(numKey(section, `scaling${i}`, 1));
  for (let i = 0; i < tlCount; i++) timeline.push(numKey(section, `timeline${i}`, i === 0 ? 0 : 1));
  return {
    lowMin: numKey(section, 'lowMin', def.lowMin ?? 0),
    lowMax: numKey(section, 'lowMax', def.lowMax ?? 0),
    highMin: numKey(section, 'highMin', def.highMin ?? 0),
    highMax: numKey(section, 'highMax', def.highMax ?? 0),
    relative: boolKey(section, 'relative', false),
    scaling,
    timeline,
  };
}

function sectionsToDocument(sections: ReadonlyMap<string, LibgdxSection>): LibgdxParticleDocument {
  // Find the emitter name: the "- Emitter -" section contains both the emitter name
  // and the root metadata keys (maxParticleCount, additive, imagePath, etc.).
  const emitterKey = [...sections.keys()].find((k) => k.startsWith('- ') && k.endsWith(' -'));
  const emitterName = emitterKey?.slice(2, -2).trim() ?? '';
  // Root keys (additive, maxParticleCount, imagePath) live in the emitter header section.
  // Fall back to the empty-key section for files that don't use the "- Name -" form.
  const root =
    (emitterKey !== undefined ? sections.get(emitterKey) : null) ??
    sections.get('Particle Effect') ??
    sections.get('') ??
    new Map<string, string>();
  const get = (name: string) => sections.get(name) ?? new Map<string, string>();
  const delaySection = get('Delay');
  const durationSection = get('Duration');
  const emissionSection = get('Emission');
  const lifeSection = get('Life');
  const lifeOffsetSection = get('Life Offset');
  const xOffSection = get('X Offset');
  const yOffSection = get('Y Offset');
  const spawnShapeSection = get('Spawn Shape');
  const spawnWidthSection = get('Spawn Width');
  const spawnHeightSection = get('Spawn Height');
  const scaleSection = get('Scale');
  const velocitySection = get('Velocity');
  const angleSection = get('Angle');
  const rotationSection = get('Rotation');
  const windSection = get('Wind');
  const gravitySection = get('Gravity');
  const tintSection = get('Tint');
  const transparencySection = get('Transparency');
  // Tint colors are stored as a comma-separated hex string and a timeline.
  const tintColors: string[] = [];
  const tintTimeline: number[] = [];
  const rawColors = strKey(tintSection, 'colors', '');
  if (rawColors) {
    rawColors.split(',').forEach((c) => {
      const trimmed = c.trim();
      if (trimmed) tintColors.push(trimmed);
    });
  }
  if (tintColors.length === 0) tintColors.push('ffffff');
  const tintTlCount = numKey(tintSection, 'timelineCount', 1) | 0 || 1;
  for (let i = 0; i < tintTlCount; i++) tintTimeline.push(numKey(tintSection, `timeline${i}`, i === 0 ? 0 : 1));
  const shapeStr = strKey(spawnShapeSection, 'shape', 'point');
  const spawnShape = {
    shape: (shapeStr === 'line' || shapeStr === 'square' || shapeStr === 'ellipse' ? shapeStr : 'point') as
      | 'point'
      | 'line'
      | 'square'
      | 'ellipse',
    edges: boolKey(spawnShapeSection, 'edges', false),
    side: (strKey(spawnShapeSection, 'side', 'both') || 'both') as 'both' | 'top' | 'bottom',
  };
  return {
    name: emitterName,
    minParticleCount: numKey(root, 'minParticleCount', 4),
    maxParticleCount: numKey(root, 'maxParticleCount', 100),
    additive: boolKey(root, 'additive', false),
    premultipliedAlpha: boolKey(root, 'premultipliedAlpha', false),
    delay: { active: boolKey(delaySection, 'active', false), ...readRange(delaySection) },
    duration: readRange(durationSection, { lowMin: 3000, lowMax: 3000 }),
    emission: readRange(emissionSection, { highMin: 32, highMax: 64 }),
    life: readRange(lifeSection, { lowMin: 1000, lowMax: 1000 }),
    lifeOffset: { active: boolKey(lifeOffsetSection, 'active', false), ...readRange(lifeOffsetSection) },
    xOffset: { active: boolKey(xOffSection, 'active', false), ...readRange(xOffSection) },
    yOffset: { active: boolKey(yOffSection, 'active', false), ...readRange(yOffSection) },
    spawnShape,
    spawnWidth: readRange(spawnWidthSection),
    spawnHeight: readRange(spawnHeightSection),
    scale: readRange(scaleSection, { highMin: 32, highMax: 32 }),
    velocity: {
      active: boolKey(velocitySection, 'active', true),
      ...readRange(velocitySection, { highMin: 100, highMax: 100 }),
    },
    angle: {
      active: boolKey(angleSection, 'active', true),
      ...readRange(angleSection, { highMin: 360, highMax: 360 }),
    },
    rotation: { active: boolKey(rotationSection, 'active', false), ...readRange(rotationSection) },
    wind: { active: boolKey(windSection, 'active', false), ...readRange(windSection) },
    gravity: { active: boolKey(gravitySection, 'active', false), ...readRange(gravitySection) },
    tint: { colors: tintColors, timeline: tintTimeline },
    transparency: readRange(transparencySection, { highMin: 1, highMax: 1 }),
    imageCount: numKey(root, 'imageCount', 1),
    imagePath: strKey(root, 'imagePath', ''),
  };
}

function strKey(section: LibgdxSection, key: string, def = ''): string {
  return section.get(key) ?? def;
}

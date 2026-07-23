import { createParticleEmitterConfig } from '@flighthq/particles';
import type {
  StarlingPexParseOptions,
  StarlingPexParseResult,
  ParticleBlendMode,
  ParticleEmitterConfig,
  StarlingPexColor,
  StarlingPexDocument,
} from '@flighthq/types';

/** @deprecated Use `StarlingPexParseResult`. */
/** Parse a Starling / Sparrow PEX XML string directly to a ParticleEmitterConfig.
 *
 *  Handles both attribute-style (`<attribute name="X" value="Y"/>`) and
 *  element-style (plist-like key/value pairs) PEX variants.
 *  Single-pass: no intermediate document object is allocated.
 *  Use `parseStarlingPexDocument` instead when you need round-trip serialisation.
 *  Throws a clear, format-tagged error when the input is not XML. */
export function parseStarlingPex(xml: string, options?: StarlingPexParseOptions): ParticleEmitterConfig {
  if (typeof xml !== 'string' || !xml.trim().startsWith('<')) {
    throw new Error('Invalid Starling PEX: input must be an XML string beginning with <');
  }
  const d = parsePexXml(xml);
  const doc = dictToDocument(d);
  return documentToConfig(doc, options?.textureSize ?? 1);
}

/** Parse a Starling / Sparrow PEX XML string and preserve the full document for
 *  round-trip serialisation via `serializeStarlingPex`.
 *  Throws a clear, format-tagged error when the input is not XML. */
export function parseStarlingPexDocument(xml: string, options?: StarlingPexParseOptions): StarlingPexParseResult {
  if (typeof xml !== 'string' || !xml.trim().startsWith('<')) {
    throw new Error('Invalid Starling PEX: input must be an XML string beginning with <');
  }
  const d = parsePexXml(xml);
  const doc = dictToDocument(d);
  return {
    config: documentToConfig(doc, options?.textureSize ?? 1),
    document: doc,
    warnings: collectStarlingPexWarnings(doc),
  };
}

const DEG2RAD = Math.PI / 180;

type PexDict = Record<string, string>;

function collectStarlingPexWarnings(doc: Readonly<StarlingPexDocument>): string[] {
  const warnings: string[] = [];
  if (doc.emitterType === 1) {
    warnings.push(
      'Radial (emitterType=1) emitter was approximated as a gravity emitter; radial motion is not simulated',
    );
  }
  if (doc.radialAcceleration !== 0 || doc.radialAccelVariance !== 0) {
    warnings.push('radialAcceleration is not supported and was ignored');
  }
  if (doc.tangentialAcceleration !== 0 || doc.tangentialAccelVariance !== 0) {
    warnings.push('tangentialAcceleration is not supported and was ignored');
  }
  return warnings;
}

function dictToDocument(d: PexDict): StarlingPexDocument {
  const WHITE: StarlingPexColor = { red: 1, green: 1, blue: 1, alpha: 1 };
  const CLEAR: StarlingPexColor = { red: 1, green: 1, blue: 1, alpha: 0 };
  const ZERO: StarlingPexColor = { red: 0, green: 0, blue: 0, alpha: 0 };
  return {
    maxParticles: pNum(d, 'maxParticles', 200) | 0,
    emitterType: (pNum(d, 'emitterType', 0) === 1 ? 1 : 0) as 0 | 1,
    duration: pNum(d, 'duration', -1),
    particleLifespan: pNum(d, 'particleLifespan', 1),
    particleLifespanVariance: pNum(d, 'particleLifespanVariance', 0),
    speed: pNum(d, 'speed', 100),
    speedVariance: pNum(d, 'speedVariance', 0),
    angle: pNum(d, 'angle', 90),
    angleVariance: pNum(d, 'angleVariance', 0),
    gravityx: pNum(d, 'gravityx', 0),
    gravityy: pNum(d, 'gravityy', 0),
    sourcePositionVariancex: pNum(d, 'sourcePositionVariancex', 0),
    sourcePositionVariancey: pNum(d, 'sourcePositionVariancey', 0),
    startParticleSize: pNum(d, 'startParticleSize', 32),
    startParticleSizeVariance: pNum(d, 'startParticleSizeVariance', 0),
    finishParticleSize: pNum(d, 'finishParticleSize', 16),
    finishParticleSizeVariance: pNum(d, 'finishParticleSizeVariance', 0),
    startColor: pColor(d, 'startColor', WHITE),
    startColorVariance: pColor(d, 'startColorVariance', ZERO),
    finishColor: pColor(d, 'finishColor', CLEAR),
    finishColorVariance: pColor(d, 'finishColorVariance', ZERO),
    rotationStart: pNum(d, 'rotationStart', 0),
    rotationStartVariance: pNum(d, 'rotationStartVariance', 0),
    rotationEnd: pNum(d, 'rotationEnd', 0),
    rotationEndVariance: pNum(d, 'rotationEndVariance', 0),
    maxRadius: pNum(d, 'maxRadius', 0),
    maxRadiusVariance: pNum(d, 'maxRadiusVariance', 0),
    minRadius: pNum(d, 'minRadius', 0),
    minRadiusVariance: pNum(d, 'minRadiusVariance', 0),
    rotatePerSecond: pNum(d, 'rotatePerSecond', 0),
    rotatePerSecondVariance: pNum(d, 'rotatePerSecondVariance', 0),
    radialAcceleration: pNum(d, 'radialAcceleration', 0),
    radialAccelVariance: pNum(d, 'radialAccelVariance', 0),
    tangentialAcceleration: pNum(d, 'tangentialAcceleration', 0),
    tangentialAccelVariance: pNum(d, 'tangentialAccelVariance', 0),
    blendFuncSource: pNum(d, 'blendFuncSource', 770),
    blendFuncDestination: pNum(d, 'blendFuncDestination', 771),
    textureFileName: pStr(d, 'textureFileName', ''),
  };
}

function documentToConfig(doc: Readonly<StarlingPexDocument>, textureSize: number): ParticleEmitterConfig {
  const angleRad = doc.angle * DEG2RAD;
  const lifespan = doc.particleLifespan;
  const lifespanVar = doc.particleLifespanVariance;
  const speed = doc.speed;
  const speedVar = doc.speedVariance;
  const vx = doc.sourcePositionVariancex;
  const vy = doc.sourcePositionVariancey;
  const emitterShape = vx === 0 && vy === 0 ? 'point' : vx === vy ? 'circle' : 'rect';
  const startSize = doc.startParticleSize / textureSize;
  const startVar = doc.startParticleSizeVariance / textureSize;
  const finishSize = doc.finishParticleSize / textureSize;
  const rotStart = doc.rotationStart;
  const rotEnd = doc.rotationEnd;
  const rotStartVar = doc.rotationStartVariance;
  const rotEndVar = doc.rotationEndVariance;
  const lifetimeMid = lifespan + lifespanVar * 0.5 || 1;
  const rotSpeedMid = ((rotStart + rotEnd) * 0.5 * DEG2RAD) / lifetimeMid;
  const rotSpeedVar = (Math.max(rotStartVar, rotEndVar) * DEG2RAD) / lifetimeMid;
  const pdDuration = doc.duration;
  return createParticleEmitterConfig({
    maxParticles: doc.maxParticles,
    loop: pdDuration <= 0,
    duration: pdDuration > 0 ? pdDuration : 0,
    lifetimeMin: Math.max(0, lifespan - lifespanVar),
    lifetimeMax: lifespan + lifespanVar,
    speedMin: Math.max(0, speed - speedVar),
    speedMax: speed + speedVar,
    directionX: Math.cos(angleRad),
    directionY: -Math.sin(angleRad),
    spread: doc.angleVariance * DEG2RAD,
    gravityX: doc.gravityx,
    gravityY: doc.gravityy,
    emitterShape,
    emitterRadius: emitterShape === 'circle' ? vx : 0,
    emitterWidth: emitterShape === 'rect' ? vx * 2 : 0,
    emitterHeight: emitterShape === 'rect' ? vy * 2 : 0,
    scaleMin: Math.max(0, startSize - startVar),
    scaleMax: startSize + startVar,
    scaleEnd: startSize > 0 ? finishSize / startSize : 1,
    colorStartR: doc.startColor.red,
    colorStartG: doc.startColor.green,
    colorStartB: doc.startColor.blue,
    colorStartVarianceR: doc.startColorVariance.red,
    colorStartVarianceG: doc.startColorVariance.green,
    colorStartVarianceB: doc.startColorVariance.blue,
    colorEndR: doc.finishColor.red,
    colorEndG: doc.finishColor.green,
    colorEndB: doc.finishColor.blue,
    colorEndVarianceR: doc.finishColorVariance.red,
    colorEndVarianceG: doc.finishColorVariance.green,
    colorEndVarianceB: doc.finishColorVariance.blue,
    alphaStart: doc.startColor.alpha,
    alphaEnd: doc.finishColor.alpha,
    rotationSpeedMin: rotSpeedMid - rotSpeedVar,
    rotationSpeedMax: rotSpeedMid + rotSpeedVar,
    blendMode: pexBlendMode(doc.blendFuncSource, doc.blendFuncDestination),
  });
}

/** Minimal XML attribute extractor. Reads `name="..."` and `value="..."` from self-closing tags. */
function extractAttr(tag: string, attrName: string): string | null {
  const re = new RegExp(`${attrName}\\s*=\\s*["']([^"']*)["']`);
  const m = re.exec(tag);
  return m ? m[1] : null;
}

function pColor(d: PexDict, prefix: string, defColor: Readonly<StarlingPexColor>): StarlingPexColor {
  // Try dot-notation (from attribute-style) first, then direct keys.
  const r = pNum(d, `${prefix}.red`, pNum(d, `${prefix}Red`, defColor.red));
  const g = pNum(d, `${prefix}.green`, pNum(d, `${prefix}Green`, defColor.green));
  const b = pNum(d, `${prefix}.blue`, pNum(d, `${prefix}Blue`, defColor.blue));
  const a = pNum(d, `${prefix}.alpha`, pNum(d, `${prefix}Alpha`, defColor.alpha));
  return { red: r, green: g, blue: b, alpha: a };
}

function pexBlendMode(src: number, dst: number): ParticleBlendMode | null {
  if ((src === 770 || src === 1) && dst === 1) return 'add';
  if (src === 770 && dst === 771) return 'normal';
  if (src === 1 && dst === 771) return 'normal';
  return null;
}

function pNum(d: PexDict, key: string, def = 0): number {
  const v = d[key];
  if (v === undefined) return def;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : def;
}

/** Parse the PEX XML into a flat key/value dict supporting both attribute-style and element-style. */
function parsePexXml(xml: string): PexDict {
  const dict: PexDict = {};
  // Pass 1: attribute-style <attribute name="X" value="Y"/>
  const ATTR_RE = /<attribute\b([^>]*)\/>/gi;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(xml)) !== null) {
    const tag = m[1];
    const name = extractAttr(tag, 'name');
    const value = extractAttr(tag, 'value');
    if (name !== null && value !== null) dict[name] = value;
  }
  // Pass 2: color attribute-style <attribute name="X" red="R" green="G" blue="B" alpha="A"/>
  const COL_RE = /<attribute\b([^>]*)\/>/gi;
  while ((m = COL_RE.exec(xml)) !== null) {
    const tag = m[1];
    const name = extractAttr(tag, 'name');
    if (name === null) continue;
    const red = extractAttr(tag, 'red');
    const green = extractAttr(tag, 'green');
    const blue = extractAttr(tag, 'blue');
    const alpha = extractAttr(tag, 'alpha');
    if (red !== null) dict[`${name}.red`] = red;
    if (green !== null) dict[`${name}.green`] = green;
    if (blue !== null) dict[`${name}.blue`] = blue;
    if (alpha !== null) dict[`${name}.alpha`] = alpha;
  }
  // Pass 3: element-style <key>X</key>...<real/integer/string>Y</...> (plist variant)
  const TAG_RE = /<(\/?)(\w+)([^>]*)>/g;
  let currentKey: string | null = null;
  let inTag: string | null = null;
  let lastTagEnd = 0;
  while ((m = TAG_RE.exec(xml)) !== null) {
    const [full, close, name, attrs] = m;
    const isSelfClose = attrs.trimEnd().endsWith('/') || full.endsWith('/>');
    const text = xml.slice(lastTagEnd, m.index).trim();
    lastTagEnd = m.index + full.length;
    if (!close && !isSelfClose) {
      if (name === 'key') inTag = 'key';
      else if (name === 'integer' || name === 'real' || name === 'string') inTag = name;
    } else if (isSelfClose) {
      if ((name === 'true' || name === 'false') && currentKey !== null && !(currentKey in dict)) {
        dict[currentKey] = name;
        currentKey = null;
      }
    } else {
      if (name === 'key' && inTag === 'key') {
        currentKey = text || null;
        inTag = null;
      } else if (currentKey !== null && !(currentKey in dict)) {
        if ((name === 'integer' || name === 'real' || name === 'string') && inTag === name) {
          dict[currentKey] = text;
          currentKey = null;
          inTag = null;
        }
      }
    }
  }
  return dict;
}

function pStr(d: PexDict, key: string, def = ''): string {
  return d[key] ?? def;
}

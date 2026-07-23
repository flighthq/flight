import { createParticleEmitterConfig } from '@flighthq/particles';
import type {
  ParticleDesignerParseOptions,
  ParticleDesignerParsed,
  ParticleBlendMode,
  ParticleEmitterConfig,
  ParticleDesignerDocument,
  ParticleDesignerRawDict,
} from '@flighthq/types';

const DEG2RAD = Math.PI / 180;

// ─── Minimal plist XML parser ────────────────────────────────────────────────

function parsePlistRawDict(xml: string): ParticleDesignerRawDict {
  const result: ParticleDesignerRawDict = {};
  const TAG_RE = /<(\/?)(\w+)([^>]*)>/g;
  let currentKey: string | null = null;
  let inTag: string | null = null;
  let lastTagEnd = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(xml)) !== null) {
    const [full, close, name, attrs] = m;
    const isSelfClose = attrs.trimEnd().endsWith('/') || full.endsWith('/>');
    const text = xml.slice(lastTagEnd, m.index).trim();
    lastTagEnd = m.index + full.length;
    if (!close && !isSelfClose) {
      if (name === 'key') inTag = 'key';
      else if (name === 'integer' || name === 'real' || name === 'string') inTag = name;
    } else if (isSelfClose) {
      if ((name === 'true' || name === 'false') && currentKey !== null) {
        result[currentKey] = name === 'true';
        currentKey = null;
      }
    } else {
      if (name === 'key' && inTag === 'key') {
        currentKey = text || null;
        inTag = null;
      } else if (currentKey !== null) {
        if (name === 'integer' && inTag === 'integer') result[currentKey] = parseInt(text, 10);
        else if (name === 'real' && inTag === 'real') result[currentKey] = parseFloat(text);
        else if (name === 'string' && inTag === 'string') result[currentKey] = unescapeXml(text);
        if (['integer', 'real', 'string'].includes(name)) {
          currentKey = null;
          inTag = null;
        }
      }
    }
  }
  return result;
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function num(d: ParticleDesignerRawDict, key: string, def = 0): number {
  const v = d[key];
  // Reject NaN (e.g. from an empty or malformed <integer>/<real> tag) so a
  // corrupt field falls back to its default instead of poisoning the config.
  return typeof v === 'number' && Number.isFinite(v) ? v : def;
}
function str(d: ParticleDesignerRawDict, key: string, def = ''): string {
  const v = d[key];
  return typeof v === 'string' ? v : def;
}

// ─── Shared conversion logic operating directly on the raw dict ──────────────

function rawDictToConfig(d: ParticleDesignerRawDict, textureSize: number): ParticleEmitterConfig {
  const angleRad = num(d, 'angle', 90) * DEG2RAD;
  const lifespan = num(d, 'particleLifespan', 1);
  const lifespanVar = num(d, 'particleLifespanVariance', 0);
  const speed = num(d, 'speed', 100);
  const speedVar = num(d, 'speedVariance', 0);
  const vx = num(d, 'sourcePositionVariancex', 0);
  const vy = num(d, 'sourcePositionVariancey', 0);
  const emitterShape = vx === 0 && vy === 0 ? 'point' : vx === vy ? 'circle' : 'rect';
  const startSize = num(d, 'startParticleSize', 32) / textureSize;
  const startVar = num(d, 'startParticleSizeVariance', 0) / textureSize;
  const finishSize = num(d, 'finishParticleSize', 16) / textureSize;
  const rotStart = num(d, 'rotationStart', 0);
  const rotEnd = num(d, 'rotationEnd', 0);
  const rotStartVar = num(d, 'rotationStartVariance', 0);
  const rotEndVar = num(d, 'rotationEndVariance', 0);
  const lifetimeMid = lifespan + lifespanVar * 0.5 || 1;
  const rotSpeedMid = ((rotStart + rotEnd) * 0.5 * DEG2RAD) / lifetimeMid;
  const rotSpeedVar = (Math.max(rotStartVar, rotEndVar) * DEG2RAD) / lifetimeMid;

  // Particle Designer `duration` is in seconds; -1 (or 0) means emit forever.
  const pdDuration = num(d, 'duration', -1);

  return createParticleEmitterConfig({
    maxParticles: num(d, 'maxParticles', 200) | 0,
    loop: pdDuration <= 0,
    duration: pdDuration > 0 ? pdDuration : 0,
    lifetimeMin: Math.max(0, lifespan - lifespanVar),
    lifetimeMax: lifespan + lifespanVar,
    speedMin: Math.max(0, speed - speedVar),
    speedMax: speed + speedVar,
    directionX: Math.cos(angleRad),
    directionY: -Math.sin(angleRad),
    spread: num(d, 'angleVariance', 0) * DEG2RAD,
    gravityX: num(d, 'gravityx', 0),
    gravityY: num(d, 'gravityy', 0),
    emitterShape,
    emitterRadius: emitterShape === 'circle' ? vx : 0,
    emitterWidth: emitterShape === 'rect' ? vx * 2 : 0,
    emitterHeight: emitterShape === 'rect' ? vy * 2 : 0,
    scaleMin: Math.max(0, startSize - startVar),
    scaleMax: startSize + startVar,
    scaleEnd: startSize > 0 ? finishSize / startSize : 1,
    colorStartR: num(d, 'startColorRed', 1),
    colorStartG: num(d, 'startColorGreen', 1),
    colorStartB: num(d, 'startColorBlue', 1),
    colorStartVarianceR: num(d, 'startColorVarianceRed', 0),
    colorStartVarianceG: num(d, 'startColorVarianceGreen', 0),
    colorStartVarianceB: num(d, 'startColorVarianceBlue', 0),
    colorEndR: num(d, 'finishColorRed', 1),
    colorEndG: num(d, 'finishColorGreen', 1),
    colorEndB: num(d, 'finishColorBlue', 1),
    colorEndVarianceR: num(d, 'finishColorVarianceRed', 0),
    colorEndVarianceG: num(d, 'finishColorVarianceGreen', 0),
    colorEndVarianceB: num(d, 'finishColorVarianceBlue', 0),
    alphaStart: num(d, 'startColorAlpha', 1),
    alphaEnd: num(d, 'finishColorAlpha', 0),
    rotationSpeedMin: rotSpeedMid - rotSpeedVar,
    rotationSpeedMax: rotSpeedMid + rotSpeedVar,
    blendMode: pdBlendMode(num(d, 'blendFuncSource', 770), num(d, 'blendFuncDestination', 771)),
  });
}

function pdBlendMode(src: number, dst: number): ParticleBlendMode | null {
  // GL_ONE=1, GL_SRC_ALPHA=770, GL_ONE_MINUS_SRC_ALPHA=771
  if ((src === 770 || src === 1) && dst === 1) return 'add';
  if (src === 770 && dst === 771) return 'normal';
  if (src === 1 && dst === 771) return 'normal'; // premultiplied alpha
  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Parse a Particle Designer plist XML string directly to a ParticleEmitterConfig.
 *
 *  Single-pass: no intermediate document object is allocated.
 *  Use `parseParticleDesignerPlistDocument` instead when you need round-trip serialisation. */
export function parseParticleDesignerPlist(
  plistXml: string,
  options?: ParticleDesignerParseOptions,
): ParticleEmitterConfig {
  return rawDictToConfig(parsePlistRawDict(plistXml), options?.textureSize ?? 1);
}

function collectParticleDesignerWarnings(d: ParticleDesignerRawDict): string[] {
  const warnings: string[] = [];
  if (num(d, 'emitterType', 0) === 1) {
    warnings.push(
      'Radial (emitterType=1) emitter was approximated as a gravity emitter; radial motion is not simulated',
    );
  }
  if (num(d, 'radialAcceleration', 0) !== 0 || num(d, 'radialAccelVariance', 0) !== 0) {
    warnings.push('radialAcceleration is not supported and was ignored');
  }
  if (num(d, 'tangentialAcceleration', 0) !== 0 || num(d, 'tangentialAccelVariance', 0) !== 0) {
    warnings.push('tangentialAcceleration is not supported and was ignored');
  }
  return warnings;
}

/** Parse a Particle Designer plist XML string and preserve the full document for
 *  round-trip serialisation via `serializeParticleDesignerPlist`. */
export function parseParticleDesignerPlistDocument(
  plistXml: string,
  options?: ParticleDesignerParseOptions,
): ParticleDesignerParsed {
  const textureSize = options?.textureSize ?? 1;
  const d = parsePlistRawDict(plistXml);
  const document: ParticleDesignerDocument = {
    maxParticles: num(d, 'maxParticles', 200) | 0,
    emitterType: (num(d, 'emitterType', 0) === 1 ? 1 : 0) as 0 | 1,
    duration: num(d, 'duration', -1),
    particleLifespan: num(d, 'particleLifespan', 1),
    particleLifespanVariance: num(d, 'particleLifespanVariance', 0),
    speed: num(d, 'speed', 100),
    speedVariance: num(d, 'speedVariance', 0),
    angle: num(d, 'angle', 90),
    angleVariance: num(d, 'angleVariance', 0),
    gravityx: num(d, 'gravityx', 0),
    gravityy: num(d, 'gravityy', 0),
    sourcePositionVariancex: num(d, 'sourcePositionVariancex', 0),
    sourcePositionVariancey: num(d, 'sourcePositionVariancey', 0),
    startParticleSize: num(d, 'startParticleSize', 32),
    startParticleSizeVariance: num(d, 'startParticleSizeVariance', 0),
    finishParticleSize: num(d, 'finishParticleSize', 16),
    finishParticleSizeVariance: num(d, 'finishParticleSizeVariance', 0),
    startColorRed: num(d, 'startColorRed', 1),
    startColorGreen: num(d, 'startColorGreen', 1),
    startColorBlue: num(d, 'startColorBlue', 1),
    startColorAlpha: num(d, 'startColorAlpha', 1),
    startColorVarianceRed: num(d, 'startColorVarianceRed', 0),
    startColorVarianceGreen: num(d, 'startColorVarianceGreen', 0),
    startColorVarianceBlue: num(d, 'startColorVarianceBlue', 0),
    startColorVarianceAlpha: num(d, 'startColorVarianceAlpha', 0),
    finishColorRed: num(d, 'finishColorRed', 1),
    finishColorGreen: num(d, 'finishColorGreen', 1),
    finishColorBlue: num(d, 'finishColorBlue', 1),
    finishColorAlpha: num(d, 'finishColorAlpha', 0),
    finishColorVarianceRed: num(d, 'finishColorVarianceRed', 0),
    finishColorVarianceGreen: num(d, 'finishColorVarianceGreen', 0),
    finishColorVarianceBlue: num(d, 'finishColorVarianceBlue', 0),
    finishColorVarianceAlpha: num(d, 'finishColorVarianceAlpha', 0),
    rotationStart: num(d, 'rotationStart', 0),
    rotationStartVariance: num(d, 'rotationStartVariance', 0),
    rotationEnd: num(d, 'rotationEnd', 0),
    rotationEndVariance: num(d, 'rotationEndVariance', 0),
    maxRadius: num(d, 'maxRadius', 0),
    maxRadiusVariance: num(d, 'maxRadiusVariance', 0),
    minRadius: num(d, 'minRadius', 0),
    minRadiusVariance: num(d, 'minRadiusVariance', 0),
    rotatePerSecond: num(d, 'rotatePerSecond', 0),
    rotatePerSecondVariance: num(d, 'rotatePerSecondVariance', 0),
    blendFuncSource: num(d, 'blendFuncSource', 770),
    blendFuncDestination: num(d, 'blendFuncDestination', 771),
    textureFileName: str(d, 'textureFileName', ''),
  };
  return { config: rawDictToConfig(d, textureSize), document, warnings: collectParticleDesignerWarnings(d) };
}

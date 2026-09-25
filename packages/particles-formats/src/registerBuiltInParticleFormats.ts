import type { ParticleFormatCodec } from '@flighthq/types/contract';
import {
  LibgdxParticleFormatKind,
  ParticleDesignerFormatKind,
  PixiParticleFormatKind,
  SpineParticleFormatKind,
  StarlingPexFormatKind,
  UnityParticleFormatKind,
} from '@flighthq/types/contract';

import { registerParticleFormat } from './formatRegistry.ts';
import { parseLibgdxParticle, parseLibgdxParticleDocument } from './libgdxParse.ts';
import { serializeLibgdxParticleDocument } from './libgdxSerialize.ts';
import { parseParticleDesignerPlist, parseParticleDesignerPlistDocument } from './particleDesignerParse.ts';
import { serializeParticleDesignerPlistDocument } from './particleDesignerSerialize.ts';
import { parsePixiParticle, parsePixiParticleDocument } from './pixiParse.ts';
import { parseSpineParticle, parseSpineParticleDocument } from './spineParse.ts';
import { serializeSpineParticleDocument } from './spineSerialize.ts';
import { parseStarlingPex, parseStarlingPexDocument } from './starlingPexParse.ts';
import { serializeStarlingPexDocument } from './starlingPexSerialize.ts';
import { parseUnityParticle, parseUnityParticleDocument } from './unityParse.ts';
import { serializeUnityParticleDocument } from './unitySerialize.ts';

/** Explicitly install the built-in particle format codecs.
 *
 *  Registration is idempotent and preserves detection precedence. Pixi is
 *  intentionally parse-only; the other built-in codecs also support export. */
export function registerBuiltInParticleFormats(): void {
  registerParticleFormat(LibgdxParticleFormatKind, libgdxCodec);
  registerParticleFormat(StarlingPexFormatKind, starlingPexCodec);
  registerParticleFormat(ParticleDesignerFormatKind, particleDesignerCodec);
  registerParticleFormat(UnityParticleFormatKind, unityCodec);
  registerParticleFormat(PixiParticleFormatKind, pixiCodec);
  registerParticleFormat(SpineParticleFormatKind, spineCodec);
}

const libgdxCodec: ParticleFormatCodec = {
  detect: (text) => text.trimStart().split('\n')[0]?.trim() === 'Particle Effect',
  parseToConfig: parseLibgdxParticle,
  parseToDocument: parseLibgdxParticleDocument,
  serialize: serializeLibgdxParticleDocument,
};

const starlingPexCodec: ParticleFormatCodec = {
  detect: (text) => isXml(text) && text.includes('<particleEmitterConfig'),
  parseToConfig: parseStarlingPex,
  parseToDocument: parseStarlingPexDocument,
  serialize: serializeStarlingPexDocument,
};

const particleDesignerCodec: ParticleFormatCodec = {
  detect: (text) => isXml(text) && text.includes('<plist'),
  parseToConfig: parseParticleDesignerPlist,
  parseToDocument: parseParticleDesignerPlistDocument,
  serialize: serializeParticleDesignerPlistDocument,
};

const unityCodec: ParticleFormatCodec = {
  detect: (text) => {
    const obj = parseJsonObject(text);
    return (
      obj !== null &&
      (hasMinMaxCurveMode(obj.startLifetime) ||
        hasMinMaxCurveMode(obj.startSpeed) ||
        hasMinMaxCurveMode(obj.startSize) ||
        typeof obj.gravityModifier === 'number' ||
        (typeof obj.looping === 'boolean' && obj.startLifetime !== undefined))
    );
  },
  parseToConfig: parseUnityParticle,
  parseToDocument: parseUnityParticleDocument,
  serialize: serializeUnityParticleDocument,
};

const pixiCodec: ParticleFormatCodec = {
  detect: (text) => {
    const obj = parseJsonObject(text);
    return (
      obj !== null &&
      obj.pos !== undefined &&
      obj.alpha !== undefined &&
      typeof obj.alpha === 'object' &&
      obj.alpha !== null &&
      ('start' in obj.alpha || 'end' in obj.alpha)
    );
  },
  parseToConfig: parsePixiParticle,
  parseToDocument: parsePixiParticleDocument,
};

const spineCodec: ParticleFormatCodec = {
  detect: (text) => {
    const obj = parseJsonObject(text);
    return (
      obj !== null && (typeof obj.continuous === 'boolean' || isRangeObject(obj.emission) || isRangeObject(obj.life))
    );
  },
  parseToConfig: parseSpineParticle,
  parseToDocument: parseSpineParticleDocument,
  serialize: serializeSpineParticleDocument,
};

function hasMinMaxCurveMode(value: unknown): boolean {
  return value !== null && typeof value === 'object' && typeof (value as { mode?: unknown }).mode === 'string';
}

function isRangeObject(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const range = value as { high?: unknown; low?: unknown };
  return typeof range.low === 'number' && typeof range.high === 'number';
}

function isXml(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith('<') || trimmed.startsWith('<?xml');
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

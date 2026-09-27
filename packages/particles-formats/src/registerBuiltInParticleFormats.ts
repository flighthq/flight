import type { ParticleFormatDescriptor, ParticleImportOptions } from '@flighthq/types/contract';
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

/**
 * Installs the formats named in `options` into the registry, in list order.
 *
 * ★ THE SEAM IS EXPLICIT AND NOTHING REGISTERS ON IMPORT. Particle formats are installed by mutating the
 * registry, so SOMETHING has to do it; doing it at module scope would make importing this module change what
 * every later detection returns, which this repository bans. Options stay inert data and this is the one place
 * they are applied.
 *
 * List order becomes registration order, which IS detection order — the registry returns the first codec whose
 * `detect` matches. Re-registering a kind is last-write-wins and leaves that kind's original position, so
 * applying a subset never reorders what was already installed.
 */
export function applyParticleImportOptions(options: Readonly<ParticleImportOptions>): void {
  for (const format of options.formats ?? []) registerParticleFormat(format.kind, format.codec);
}

/** Explicitly install the built-in particle format codecs.
 *
 *  Registration is idempotent and preserves detection precedence. Pixi is
 *  intentionally parse-only; the other built-in codecs also support export. */
export function registerBuiltInParticleFormats(): void {
  applyParticleImportOptions({ formats: particleAllFormats });
}

export const libgdxParticleFormat: Readonly<ParticleFormatDescriptor> = {
  codec: {
    detect: (text) => text.trimStart().split('\n')[0]?.trim() === 'Particle Effect',
    parseToConfig: parseLibgdxParticle,
    parseToDocument: parseLibgdxParticleDocument,
    serialize: serializeLibgdxParticleDocument,
  },
  kind: LibgdxParticleFormatKind,
};

export const starlingPexParticleFormat: Readonly<ParticleFormatDescriptor> = {
  codec: {
    detect: (text) => isXml(text) && text.includes('<particleEmitterConfig'),
    parseToConfig: parseStarlingPex,
    parseToDocument: parseStarlingPexDocument,
    serialize: serializeStarlingPexDocument,
  },
  kind: StarlingPexFormatKind,
};

export const particleDesignerParticleFormat: Readonly<ParticleFormatDescriptor> = {
  codec: {
    detect: (text) => isXml(text) && text.includes('<plist') && hasParticleDesignerKey(text),
    parseToConfig: parseParticleDesignerPlist,
    parseToDocument: parseParticleDesignerPlistDocument,
    serialize: serializeParticleDesignerPlistDocument,
  },
  kind: ParticleDesignerFormatKind,
};

export const unityParticleFormat: Readonly<ParticleFormatDescriptor> = {
  codec: {
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
  },
  kind: UnityParticleFormatKind,
};

export const pixiParticleFormat: Readonly<ParticleFormatDescriptor> = {
  codec: {
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
  },
  kind: PixiParticleFormatKind,
};

export const spineParticleFormat: Readonly<ParticleFormatDescriptor> = {
  codec: {
    detect: (text) => {
      const obj = parseJsonObject(text);
      return (
        obj !== null && (typeof obj.continuous === 'boolean' || isRangeObject(obj.emission) || isRangeObject(obj.life))
      );
    },
    parseToConfig: parseSpineParticle,
    parseToDocument: parseSpineParticleDocument,
    serialize: serializeSpineParticleDocument,
  },
  kind: SpineParticleFormatKind,
};

/**
 * Every built-in particle format, in the order the registry consults them.
 *
 * Naming this is equivalent to calling `registerBuiltInParticleFormats`, and it is what a caller passes when
 * they want every format. A caller wanting a subset names the descriptors they want, and the codecs they leave
 * out — and the parse code behind them — never link.
 */
export const particleAllFormats: readonly Readonly<ParticleFormatDescriptor>[] = [
  libgdxParticleFormat,
  starlingPexParticleFormat,
  particleDesignerParticleFormat,
  unityParticleFormat,
  pixiParticleFormat,
  spineParticleFormat,
];

function hasMinMaxCurveMode(value: unknown): boolean {
  return value !== null && typeof value === 'object' && typeof (value as { mode?: unknown }).mode === 'string';
}

function isRangeObject(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const range = value as { high?: unknown; low?: unknown };
  return typeof range.low === 'number' && typeof range.high === 'number';
}

/**
 * Whether a plist declares a key only a ParticleDesigner emitter carries.
 *
 * ★ "IS A PLIST" WAS NOT "IS A PARTICLE CONFIG", AND THE DIFFERENCE IS PAID IN SOMEONE ELSE'S BUNDLE. The plist
 * container is shared: Cocos writes spritesheets as plists too, and `@flighthq/spritesheet-formats` reads them.
 * With only the `<plist` check, every Cocos sheet in a build also claimed this codec, so the ParticleDesigner
 * parser linked into any project whose only plist was a spritesheet. That surfaced when the manifest plugin began
 * analysing shared extensions by unioning every family that recognises an asset — a union reports each family's
 * answer faithfully, so an over-broad detector stops being local to its own family.
 *
 * The three keys are the emitter's own required parameters and appear in every ParticleDesigner export; a Cocos
 * sheet (`frames`, `metadata`) carries none of them. Matched as EXACT key elements rather than as substrings:
 * `particleLifespan` is a prefix of `particleLifespanVariance`, and a sheet is free to name a frame anything at
 * all, so a bare `text.includes` would reintroduce the same class of false positive it is here to remove.
 *
 * This is a detector, not a schema: the parser still reads every field with a default and accepts a plist that
 * declares only one of these. The check says "this document is addressed to us", nothing more.
 */
function hasParticleDesignerKey(text: string): boolean {
  return PARTICLE_DESIGNER_KEY_PATTERN.test(text);
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

// Anchored on both tags so the name is an exact key element, never a substring of a longer one.
const PARTICLE_DESIGNER_KEY_PATTERN = /<key>\s*(?:maxParticles|particleLifespan|emitterType)\s*<\/key>/;

import { readFileSync } from 'node:fs';

import type { Entry } from './captureEntries.js';

export interface CaptureManifest {
  entries: Entry[];
  subject: string;
  validation?: {
    fingerprintSkip?: string[];
    paritySkip?: Record<string, 'all' | string[]>;
  };
}

export function parseCaptureManifest(source: string, sourceName: string = 'capture manifest'): CaptureManifest {
  const value = JSON.parse(source) as Partial<CaptureManifest>;
  if (typeof value.subject !== 'string' || value.subject === '') throw new Error(`${sourceName}: missing subject`);
  if (!Array.isArray(value.entries)) throw new Error(`${sourceName}: missing entries array`);
  for (const entry of value.entries) {
    if (typeof entry?.name !== 'string' || entry.name === '' || !Array.isArray(entry.renderers)) {
      throw new Error(`${sourceName}: every entry needs name and renderers`);
    }
    if (entry.route !== undefined) throw new Error(`${sourceName}: JSON entries must use declarative routes`);
    for (const renderer of entry.renderers) {
      if (typeof renderer !== 'string' || typeof entry.routes?.[renderer] !== 'string') {
        throw new Error(`${sourceName}: entry ${entry.name} needs a route for renderer ${String(renderer)}`);
      }
    }
  }
  if (value.validation !== undefined) {
    const { fingerprintSkip, paritySkip } = value.validation;
    if (fingerprintSkip !== undefined && !isStringArray(fingerprintSkip)) {
      throw new Error(`${sourceName}: validation.fingerprintSkip must be a string array`);
    }
    if (paritySkip !== undefined) {
      if (typeof paritySkip !== 'object' || paritySkip === null || Array.isArray(paritySkip)) {
        throw new Error(`${sourceName}: validation.paritySkip must be an object`);
      }
      for (const [name, renderers] of Object.entries(paritySkip)) {
        if (renderers !== 'all' && !isStringArray(renderers)) {
          throw new Error(`${sourceName}: validation.paritySkip.${name} must be "all" or a string array`);
        }
      }
    }
  }
  return value as CaptureManifest;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function readCaptureManifest(path: string): CaptureManifest {
  return parseCaptureManifest(readFileSync(path, 'utf8'), path);
}

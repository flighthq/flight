// Generated from crates/flight-host/tests/backend_explanation_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  getBackendExplanationLayerString,
  getBackendExplanationViabilityString,
  parseBackendExplanationLayer,
  parseBackendExplanationViability,
} from './contract.ts';
import type { BackendExplanation, BackendExplanationLayer, BackendExplanationViability } from './contract.ts';

const LAYERS: Array<readonly [BackendExplanationLayer, string]> = [
  ['custom', 'custom'],
  ['host', 'host'],
  ['host-not-enabled', 'host-not-enabled'],
  ['no-host-implementation', 'no-host-implementation'],
];

const VIABILITIES: Array<readonly [BackendExplanationViability, string]> = [
  ['available', 'available'],
  ['runtime-api-unavailable', 'runtime-api-unavailable'],
  ['unobserved', 'unobserved'],
];

describe('backendExplanation', () => {
  it('is plain data whose operation may be absent', () => {
    const explanation: BackendExplanation = {
      conflict: false,
      layer: 'host-not-enabled',
      operation: null,
      viability: 'unobserved',
    } as const;
    expect(explanation).toEqual(explanation);
    expect(explanation).not.toEqual({
      conflict: false,
      layer: 'host-not-enabled',
      operation: 'read',
      viability: 'unobserved',
    });
  });
});

describe('getBackendExplanationLayerString', () => {
  it('returns the exact ts strings', () => {
    for (const [value, text] of LAYERS) {
      expect(getBackendExplanationLayerString(value)).toEqual(text);
    }
  });
});

describe('getBackendExplanationViabilityString', () => {
  it('returns the exact ts strings', () => {
    for (const [value, text] of VIABILITIES) {
      expect(getBackendExplanationViabilityString(value)).toEqual(text);
    }
  });
});

describe('parseBackendExplanationLayer', () => {
  it('parses the exact ts strings', () => {
    for (const [value, text] of LAYERS) {
      expect(parseBackendExplanationLayer(text)).toEqual(value);
    }
  });
  it('rejects the operation layer vocabulary and other text', () => {
    expect(parseBackendExplanationLayer('sentinel')).toEqual(undefined);
    expect(parseBackendExplanationLayer('none')).toEqual(undefined);
    expect(parseBackendExplanationLayer('Host')).toEqual(undefined);
    expect(parseBackendExplanationLayer('')).toEqual(undefined);
  });
});

describe('parseBackendExplanationViability', () => {
  it('parses the exact ts strings', () => {
    for (const [value, text] of VIABILITIES) {
      expect(parseBackendExplanationViability(text)).toEqual(value);
    }
  });
  it('rejects other text', () => {
    expect(parseBackendExplanationViability('unavailable')).toEqual(undefined);
    expect(parseBackendExplanationViability('')).toEqual(undefined);
  });
});

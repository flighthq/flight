// Generated from crates/flight-host/tests/backend_operation_explanation_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { getBackendOperationExplanationLayerString, parseBackendOperationExplanationLayer } from './contract.ts';
import type { BackendOperationExplanation, BackendOperationExplanationLayer } from './contract.ts';

const LAYERS: Array<readonly [BackendOperationExplanationLayer, string]> = [
  ['custom', 'custom'],
  ['host', 'host'],
  ['none', 'none'],
  ['sentinel', 'sentinel'],
];

describe('backendOperationExplanation', () => {
  it('distinguishes an absent implementation from a sentinel', () => {
    const sentinel: BackendOperationExplanation = {
      implemented: false,
      layer: 'sentinel',
      operation: 'getAccessoryBarVisible',
    } as const;
    const absent: BackendOperationExplanation = {
      implemented: false,
      layer: 'none',
      operation: 'getAccessoryBarVisible',
    } as const;
    expect(!sentinel.implemented && !absent.implemented).toBe(true);
    expect(sentinel).not.toEqual(absent);
  });
});

describe('getBackendOperationExplanationLayerString', () => {
  it('returns the exact ts strings', () => {
    for (const [value, text] of LAYERS) {
      expect(getBackendOperationExplanationLayerString(value)).toEqual(text);
    }
  });
  it('keeps none and sentinel distinct', () => {
    expect(getBackendOperationExplanationLayerString('none')).not.toEqual(
      getBackendOperationExplanationLayerString('sentinel'),
    );
  });
});

describe('parseBackendOperationExplanationLayer', () => {
  it('parses the exact ts strings', () => {
    for (const [value, text] of LAYERS) {
      expect(parseBackendOperationExplanationLayer(text)).toEqual(value);
    }
  });
  it('rejects the backend layer vocabulary and other text', () => {
    expect(parseBackendOperationExplanationLayer('host-not-enabled')).toEqual(undefined);
    expect(parseBackendOperationExplanationLayer('no-host-implementation')).toEqual(undefined);
    expect(parseBackendOperationExplanationLayer('Sentinel')).toEqual(undefined);
    expect(parseBackendOperationExplanationLayer('')).toEqual(undefined);
  });
});

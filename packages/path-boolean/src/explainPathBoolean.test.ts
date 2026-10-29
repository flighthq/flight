// Generated from crates/flight-path-boolean/tests/explain_path_boolean_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import { createMartinezPathBooleanKernel, explainOffsetPath, explainSimplifyPath } from './contract.ts';

describe('explainOffsetPath', () => {
  it('distinguishes empty invalid collapsed and viable results', () => {
    const kernel = createMartinezPathBooleanKernel();
    const empty = createPath('nonZero');
    const result = explainOffsetPath(kernel, empty, 1.0, undefined);
    expect(result !== undefined).toBe(true);
    expect(result!.reason).toEqual('empty-input');
    let sq = createPath('nonZero');
    appendPathMoveTo(sq, 0.0, 0.0);
    appendPathLineTo(sq, 1.0, 0.0);
    appendPathLineTo(sq, 1.0, 1.0);
    appendPathLineTo(sq, 0.0, 1.0);
    appendPathClose(sq);
    const nanResult = explainOffsetPath(kernel, sq, Number.NaN, undefined);
    expect(nanResult !== undefined).toBe(true);
    expect(nanResult!.reason).toEqual('non-finite-delta');
    const collapsed = explainOffsetPath(kernel, sq, -1.0, undefined);
    expect(collapsed !== undefined).toBe(true);
    expect(collapsed!.reason).toEqual('collapsed-or-degenerate');
    const viable = explainOffsetPath(kernel, sq, 1.0, undefined);
    expect(viable === undefined).toBe(true);
  });
});

describe('explainSimplifyPath', () => {
  it('distinguishes empty input from a viable region', () => {
    const kernel = createMartinezPathBooleanKernel();
    const empty = createPath('nonZero');
    const result = explainSimplifyPath(kernel, empty, undefined);
    expect(result !== undefined).toBe(true);
    expect(result!.reason).toEqual('empty-input');
    let triangle = createPath('nonZero');
    appendPathMoveTo(triangle, 0.0, 0.0);
    appendPathLineTo(triangle, 1.0, 0.0);
    appendPathLineTo(triangle, 0.0, 1.0);
    appendPathClose(triangle);
    const viable = explainSimplifyPath(kernel, triangle, undefined);
    expect(viable === undefined).toBe(true);
  });
});

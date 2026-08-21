import { describe, expect, it } from 'vitest';

import { resolveReferenceImageRetirement } from './reference-image-retire';

const target = (entry: string, renderer: string, pixelSha256 = 'a'.repeat(64)) => ({ entry, renderer, pixelSha256 });

describe('resolveReferenceImageRetirement', () => {
  // ★ THE COST OF NOT RETIRING: an open request demotes its cell to `pending`, so the gate never compares
  // it. 74 fulfilled-but-open requests had accumulated, holding blessed cells out of comparison while the
  // run reported green — and expiry could not catch them, because request age comes from a date suffix
  // these bare-UUID ids do not have.
  it('removes a request whose every cell is blessed with exactly the pinned pixels', () => {
    const result = resolveReferenceImageRetirement(
      [{ id: 'done', subject: 'functional', targets: [target('a', 'webgl')] }],
      new Map([['functional/a/webgl', 'a'.repeat(64)]]),
    );

    expect(result.remove).toEqual(['done']);
    expect(result.mismatched).toEqual([]);
  });

  // Most requests name several cells and only some have landed, so whole-file deletion would retire cells
  // that are still waiting. Narrow instead.
  it('narrows a request to the cells that are still outstanding', () => {
    const result = resolveReferenceImageRetirement(
      [{ id: 'partial', subject: 'functional', targets: [target('a', 'webgl'), target('a', 'webgpu')] }],
      new Map([['functional/a/webgl', 'a'.repeat(64)]]),
    );

    expect(result.remove).toEqual([]);
    expect(result.rewrite.get('partial')).toEqual([target('a', 'webgpu')]);
  });

  // ★ FULFILLED MEANS THE PINNED PIXELS ARE THE BLESSED PIXELS. A cell blessed with something else is the
  // queue asking for one picture and a different one landing — a finding, not housekeeping — so it is
  // reported and the request is left alone.
  it('reports a cell blessed with different pixels and does not retire it', () => {
    const result = resolveReferenceImageRetirement(
      [{ id: 'other', subject: 'functional', targets: [target('a', 'webgl')] }],
      new Map([['functional/a/webgl', 'b'.repeat(64)]]),
    );

    expect(result.mismatched).toEqual(['functional/a/webgl']);
    expect(result.remove).toEqual([]);
    expect(result.rewrite.size).toBe(0);
  });

  it('leaves an unblessed request completely untouched', () => {
    const result = resolveReferenceImageRetirement(
      [{ id: 'waiting', subject: 'functional', targets: [target('a', 'webgl')] }],
      new Map(),
    );

    expect(result.remove).toEqual([]);
    expect(result.rewrite.size).toBe(0);
    expect(result.mismatched).toEqual([]);
  });

  // The subject is half the identity: two tools may both have an `a/webgl`, and matching across them
  // would retire a request for a cell that was never blessed.
  it('does not treat a same-named cell of another subject as blessed', () => {
    const result = resolveReferenceImageRetirement(
      [{ id: 'fn', subject: 'functional', targets: [target('a', 'webgl')] }],
      new Map([['examples/a/webgl', 'a'.repeat(64)]]),
    );

    expect(result.remove).toEqual([]);
    expect(result.rewrite.size).toBe(0);
  });
});

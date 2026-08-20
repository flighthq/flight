import { describe, expect, it } from 'vitest';

import { parseReviewApprovals, serializeReviewApprovals } from '../tools/review/src/approvalState';

describe('parseReviewApprovals', () => {
  // ★ THE BUG THIS EXISTS FOR: the dev server sends a `full-reload` on every screenshot.png,
  // status.json or tolerance-manifest change, so the marks a reviewer had just made were wiped by the
  // reviewer's own capture. And because no-marks means all-cells downstream, the next Commission then
  // took every eligible cell instead of the marked ones — silently doing the opposite of the selection.
  it('restores the marks a reload would otherwise have wiped', () => {
    const approvals = parseReviewApprovals('["functional/effect-bloom/webgl","functional/effect-bloom/webgpu"]');

    expect(approvals.get('functional/effect-bloom/webgl')).toBe(true);
    expect(approvals.get('functional/effect-bloom/webgpu')).toBe(true);
    expect(approvals.size).toBe(2);
  });

  // An empty working set and a corrupt one are the same thing to a reviewer — both mean "mark them
  // again" — and neither is worth refusing to start the tool over.
  it('treats absent, empty, malformed and non-array storage as no marks', () => {
    expect(parseReviewApprovals(null).size).toBe(0);
    expect(parseReviewApprovals('').size).toBe(0);
    expect(parseReviewApprovals('{not json').size).toBe(0);
    expect(parseReviewApprovals('{"a":true}').size).toBe(0);
  });

  // Only `true` is ever stored, so anything that is not a usable key is dropped rather than admitted as
  // a mark — an entry that parsed to `undefined` would otherwise read as "marked" via a bare get().
  it('drops entries that are not usable keys', () => {
    const approvals = parseReviewApprovals('["functional/a/webgl","",null,7,{"b":1}]');

    expect([...approvals.keys()]).toEqual(['functional/a/webgl']);
  });
});

describe('serializeReviewApprovals', () => {
  it('round-trips through parse', () => {
    const original = new Map([
      ['functional/b/webgpu', true],
      ['functional/a/webgl', true],
    ]);

    expect(parseReviewApprovals(serializeReviewApprovals(original))).toEqual(original);
  });

  // Sorted so the stored value is stable: an unstable string would rewrite session storage on every
  // keystroke and make a diff of the state meaningless.
  it('writes the marked keys in sorted order and omits unmarked ones', () => {
    const approvals = new Map([
      ['functional/b/webgpu', true],
      ['functional/a/webgl', true],
      ['functional/c/canvas', false],
    ]);

    expect(serializeReviewApprovals(approvals)).toBe('["functional/a/webgl","functional/b/webgpu"]');
  });

  it('writes an empty array when nothing is marked', () => {
    expect(serializeReviewApprovals(new Map())).toBe('[]');
  });
});

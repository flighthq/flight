import { describe, expect, it } from 'vitest';

import { resolveReviewRequestSupersede } from '../tools/review/src/requestSupersede';

const cells = (...pairs: string[]) =>
  pairs.map((pair) => {
    const [entry, renderer] = pair.split('/');
    return { entry: entry!, renderer: renderer! };
  });

describe('resolveReviewRequestSupersede', () => {
  // ★ THE FAILURE THIS ENDS: nothing on the write path read the queue, so commissioning a cell twice left
  // it claimed by two open requests and `request-overlap` failed CI. Ten accumulated that way.
  it('removes an older request the incoming one fully replaces', () => {
    const result = resolveReviewRequestSupersede('functional', cells('effect-sepia/webgl'), [
      { id: 'old', subject: 'functional', released: false, targets: cells('effect-sepia/webgl') },
    ]);

    expect(result.remove).toEqual(['old']);
    expect([...result.rewrite.keys()]).toEqual([]);
  });

  // Narrowed, never widened: a request covering four cells keeps the three nobody re-commissioned rather
  // than losing them to a re-commission of their sibling.
  it('narrows a partly overlapping request instead of deleting it', () => {
    const result = resolveReviewRequestSupersede('functional', cells('text-basic/webgl'), [
      {
        id: 'old',
        subject: 'functional',
        released: false,
        targets: cells('text-basic/canvas', 'text-basic/webgl', 'text-basic/dom'),
      },
    ]);

    expect(result.remove).toEqual([]);
    expect(result.rewrite.get('old')).toEqual(cells('text-basic/canvas', 'text-basic/dom'));
  });

  it('leaves an unrelated request alone', () => {
    const result = resolveReviewRequestSupersede('functional', cells('effect-sepia/webgl'), [
      { id: 'other', subject: 'functional', released: false, targets: cells('effect-invert/webgl') },
    ]);

    expect(result.remove).toEqual([]);
    expect(result.rewrite.size).toBe(0);
  });

  // The subject is half the identity: two tools may both have an `effect-sepia/webgl`, and superseding
  // across them would delete a request for a cell the commission never touched.
  it('does not supersede a same-named cell belonging to another subject', () => {
    const result = resolveReviewRequestSupersede('functional', cells('effect-sepia/webgl'), [
      { id: 'examples', subject: 'examples', released: false, targets: cells('effect-sepia/webgl') },
    ]);

    expect(result.remove).toEqual([]);
    expect(result.rewrite.size).toBe(0);
  });

  it('supersedes across several open requests at once', () => {
    const result = resolveReviewRequestSupersede('functional', cells('a/webgl', 'a/webgpu'), [
      { id: 'one', subject: 'functional', released: false, targets: cells('a/webgl') },
      { id: 'two', subject: 'functional', released: false, targets: cells('a/webgpu', 'b/webgl') },
      { id: 'three', subject: 'functional', released: false, targets: cells('c/canvas') },
    ]);

    expect(result.remove).toEqual(['one']);
    expect(result.rewrite.get('two')).toEqual(cells('b/webgl'));
    expect(result.rewrite.has('three')).toBe(false);
  });

  // A released request is left whole: its bytes are what an approval is bound to, and narrowing one is
  // what broke reconciliation when retirement did it. The new commission coexists until intake completes.
  it('leaves a released request untouched even when it claims the same cell', () => {
    const result = resolveReviewRequestSupersede('functional', cells('a/webgl'), [
      { id: 'released', subject: 'functional', released: true, targets: cells('a/webgl') },
    ]);

    expect(result.remove).toEqual([]);
    expect(result.rewrite.size).toBe(0);
  });
});

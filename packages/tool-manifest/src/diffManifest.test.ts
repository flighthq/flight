import { diffManifest, isManifestDiffSatisfied } from './diffManifest.js';
import { createManifest } from './manifest.js';

describe('diffManifest', () => {
  it('splits required features into supported and missing', () => {
    const diff = diffManifest(createManifest({ g: ['a', 'b'] }), createManifest({ g: ['a', 'c'] }));
    expect(diff.supported).toEqual({ g: ['a'] });
    expect(diff.missing).toEqual({ g: ['b'] });
    expect(diff.unused).toEqual({ g: ['c'] });
  });

  it('reports every id missing for a required group the available side never declares', () => {
    // Skipping the group for want of a counterpart would report a satisfiable build that is not one.
    const diff = diffManifest(createManifest({ absent: ['a'] }), createManifest());
    expect(diff.missing).toEqual({ absent: ['a'] });
  });

  it('reports an available group nothing requires as entirely unused', () => {
    expect(diffManifest(createManifest(), createManifest({ extra: ['x'] })).unused).toEqual({ extra: ['x'] });
  });

  it('omits empty buckets so a clean diff is visibly empty', () => {
    const diff = diffManifest(createManifest({ g: ['a'] }), createManifest({ g: ['a'] }));
    expect(diff).toEqual({ missing: {}, supported: { g: ['a'] }, unused: {} });
  });
});

describe('isManifestDiffSatisfied', () => {
  it('is true when nothing is missing, even with unused features available', () => {
    expect(isManifestDiffSatisfied(diffManifest(createManifest(), createManifest({ g: ['x'] })))).toBe(true);
  });

  it('is false when anything is missing', () => {
    expect(isManifestDiffSatisfied(diffManifest(createManifest({ g: ['x'] }), createManifest()))).toBe(false);
  });
});
